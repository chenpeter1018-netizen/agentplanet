/// Agent Planet 授权系统 — 离线签名验证 + 在线激活计数
/// Ed25519 数字签名，私钥由开发者保管，公钥内嵌

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

// ═══════════════════════════════════════════
// 公钥（编译后不可篡改，私钥由开发者保管）
// ═══════════════════════════════════════════
const PUBLIC_KEY_BYTES: [u8; 32] = [
    0xd3, 0x15, 0xef, 0x06, 0x7f, 0x2c, 0x88, 0xb4,
    0xfc, 0xc8, 0x5e, 0x1d, 0x5d, 0x5a, 0x6e, 0x79,
    0x72, 0x8f, 0x3a, 0xa9, 0x93, 0xec, 0x4c, 0x91,
    0x91, 0xd6, 0x8c, 0x61, 0x9f, 0xd9, 0x96, 0x59,
];

/// 激活服务器地址（可部署在 Vercel/Cloudflare Workers）
const ACTIVATION_SERVER: &str = "https://activation-server-roan.vercel.app";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub licensee: String,
    pub product: String,           // "agent-planet-pro" / "agent-planet-enterprise"
    pub issued_at: u64,            // Unix 时间戳
    pub expires_at: u64,           // 0 = 永久
    pub max_machines: u32,         // 最大激活机器数
    pub key_id: String,            // 唯一注册码 ID（防重放）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivatedLicense {
    pub payload: LicensePayload,
    pub fingerprints: Vec<String>,
    pub activated_at: u64,
    pub online_verified: bool,     // 是否经过在线验证
    pub activation_token: String,  // 服务器签发的激活令牌
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub activated: bool,
    pub licensee: String,
    pub product: String,
    pub expires_at: u64,
    pub is_expired: bool,
    pub machines_used: usize,
    pub max_machines: u32,
    pub days_remaining: Option<i64>,
    pub online_verified: bool,
}

// ═══════════════════════════════════════════
// 硬件指纹
// ═══════════════════════════════════════════

fn machine_fingerprint() -> String {
    let mut hasher = Sha256::new();
    hasher.update(std::env::consts::OS.as_bytes());
    hasher.update(std::env::consts::ARCH.as_bytes());

    if let Ok(h) = hostname() {
        hasher.update(h.as_bytes());
    }
    if let Ok(mac) = get_first_mac() {
        hasher.update(mac.as_bytes());
    }
    hex_encode(&hasher.finalize()[..8])
}

fn hostname() -> Result<String, ()> {
    if let Ok(h) = std::env::var("COMPUTERNAME") { return Ok(h.trim().into()); }
    if let Ok(h) = std::env::var("HOSTNAME") { return Ok(h.trim().into()); }
    if let Ok(out) = std::process::Command::new("hostname").output() {
        if let Ok(s) = String::from_utf8(out.stdout) {
            return Ok(s.trim().into());
        }
    }
    Err(())
}

fn get_first_mac() -> Result<String, ()> {
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("ifconfig")
            .args(["en0"]).output().map_err(|_| ())?;
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if line.contains("ether") {
                let p: Vec<&str> = line.split_whitespace().collect();
                if p.len() >= 2 { return Ok(p[1].replace(':', "").to_uppercase()); }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("getmac")
            .output().map_err(|_| ())?;
        for p in String::from_utf8_lossy(&out.stdout).split_whitespace() {
            if p.len() == 17 && p.contains('-') {
                return Ok(p.replace('-', "").to_uppercase());
            }
        }
    }
    Err(())
}

fn hex_encode(data: &[u8]) -> String {
    data.iter().map(|b| format!("{b:02x}")).collect()
}

// ═══════════════════════════════════════════
// 签名验证
// ═══════════════════════════════════════════

fn public_key() -> Result<VerifyingKey, String> {
    VerifyingKey::from_bytes(&PUBLIC_KEY_BYTES.into())
        .map_err(|e| format!("公钥错误: {e}"))
}

fn verify_key(key: &str) -> Result<LicensePayload, String> {
    let cleaned: String = key.chars().filter(|c| c.is_alphanumeric()).collect();
    if cleaned.len() < 64 {
        return Err("注册码格式不正确".into());
    }
    let decoded = base32_decode(&cleaned).map_err(|e| format!("注册码解码失败: {e}"))?;
    if decoded.len() < 64 { return Err("注册码内容不完整".into()); }

    let (sig_bytes, payload_bytes) = decoded.split_at(64);
    let sig = Signature::from_slice(sig_bytes).map_err(|e| format!("签名错误: {e}"))?;
    public_key()?
        .verify(payload_bytes, &sig)
        .map_err(|_| "注册码无效：签名验证不通过，请确认注册码完整复制".to_string())?;

    let payload: LicensePayload =
        serde_json::from_slice(payload_bytes).map_err(|e| format!("载荷错误: {e}"))?;
    Ok(payload)
}

// ═══════════════════════════════════════════
// Base32（排除 0/O/1/I/L 易混淆字符）
// ═══════════════════════════════════════════

const B32: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

fn base32_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut bits: u32 = 0;
    let mut count: u8 = 0;
    let mut out = Vec::new();
    for c in input.chars() {
        let v = B32.iter().position(|&x| x == c.to_ascii_uppercase() as u8)
            .ok_or_else(|| format!("无效字符: {c}"))?;
        bits = (bits << 5) | v as u32;
        count += 5;
        if count >= 8 { out.push((bits >> (count - 8)) as u8); count -= 8; }
    }
    Ok(out)
}

// ═══════════════════════════════════════════
// 存储
// ═══════════════════════════════════════════

fn license_path() -> PathBuf {
    dirs::data_dir().unwrap_or_else(|| PathBuf::from("."))
        .join("agent-planet").join("license.json")
}

fn read_license() -> Option<ActivatedLicense> {
    let data = std::fs::read_to_string(license_path()).ok()?;
    serde_json::from_str(&data).ok()
}

fn write_license(l: &ActivatedLicense) -> Result<(), String> {
    let path = license_path();
    if let Some(p) = path.parent() { std::fs::create_dir_all(p).map_err(|e| format!("mkdir: {e}"))?; }
    let data = serde_json::to_string_pretty(l).map_err(|e| format!("json: {e}"))?;
    std::fs::write(&path, data).map_err(|e| format!("write: {e}"))
}

// ═══════════════════════════════════════════
// 在线激活 HTTP 请求
// ═══════════════════════════════════════════

fn activate_online(payload: &LicensePayload, fingerprint: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "key_id": payload.key_id,
        "fingerprint": fingerprint,
        "product": payload.product,
        "licensee": payload.licensee,
    });

    let client = reqwest::blocking::Client::new()
        .post(format!("{ACTIVATION_SERVER}/api/activate"))
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .map_err(|e| format!("连接激活服务器失败: {e}"))?;

    if !client.status().is_success() {
        let msg = client.text().unwrap_or_default();
        return Err(format!("激活被拒绝: {msg}"));
    }

    let resp: serde_json::Value = client.json().map_err(|e| format!("响应解析失败: {e}"))?;
    resp["token"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "服务器未返回激活令牌".into())
}

// ═══════════════════════════════════════════
// Tauri 命令
// ═══════════════════════════════════════════

#[tauri::command]
pub fn activate_license(key: String, online: Option<bool>) -> Result<LicenseStatus, String> {
    let payload = verify_key(&key)?;

    // 检查到期
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    if payload.expires_at > 0 && now > payload.expires_at {
        return Err("注册码已过期".into());
    }

    let fp = machine_fingerprint();
    let mut license = read_license().unwrap_or(ActivatedLicense {
        payload: payload.clone(),
        fingerprints: Vec::new(),
        activated_at: now,
        online_verified: false,
        activation_token: String::new(),
    });

    // 机器绑定检查
    if !license.fingerprints.contains(&fp) {
        if license.fingerprints.len() >= payload.max_machines as usize {
            return Err(format!(
                "已达到最大激活数 ({}/{})。请购买更多授权。",
                license.fingerprints.len(), payload.max_machines
            ));
        }
    }

    // 在线激活（如果请求）
    let want_online = online.unwrap_or(true);
    if want_online && !license.online_verified {
        match activate_online(&payload, &fp) {
            Ok(token) => {
                license.online_verified = true;
                license.activation_token = token;
            }
            Err(e) => {
                // 在线验证失败，给 3 天试用
                eprintln!("[license] 在线激活失败: {e}，使用离线模式");
            }
        }
    }

    if !license.fingerprints.contains(&fp) {
        license.fingerprints.push(fp);
        license.activated_at = now;
    }
    write_license(&license)?;

    Ok(build_status(&license))
}

#[tauri::command]
pub fn check_license() -> LicenseStatus {
    read_license().map(|l| build_status(&l)).unwrap_or(LicenseStatus {
        activated: false, licensee: String::new(), product: String::new(),
        expires_at: 0, is_expired: false, machines_used: 0, max_machines: 0,
        days_remaining: None, online_verified: false,
    })
}

fn build_status(l: &ActivatedLicense) -> LicenseStatus {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    LicenseStatus {
        activated: true,
        licensee: l.payload.licensee.clone(),
        product: l.payload.product.clone(),
        expires_at: l.payload.expires_at,
        is_expired: l.payload.expires_at > 0 && now > l.payload.expires_at,
        machines_used: l.fingerprints.len(),
        max_machines: l.payload.max_machines,
        days_remaining: if l.payload.expires_at > 0 {
            Some(((l.payload.expires_at - now) as f64 / 86400.0).ceil() as i64)
        } else { None },
        online_verified: l.online_verified,
    }
}

/// 开发者工具：生成新的密钥对
#[allow(dead_code)]
pub fn generate_keypair() -> (SigningKey, VerifyingKey) {
    let mut csprng = OsRng;
    let sk = SigningKey::generate(&mut csprng);
    let vk = sk.verifying_key();
    (sk, vk)
}
