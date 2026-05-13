/// Agent Planet 授权系统 — 首次激活需联网，之后离线可用
/// Ed25519 数字签名验证 + 机器指纹绑定 + 3天离线试用

use ed25519_dalek::{Signature, SigningKey, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

const PUBLIC_KEY_BYTES: [u8; 32] = [
    0xd3, 0x15, 0xef, 0x06, 0x7f, 0x2c, 0x88, 0xb4,
    0xfc, 0xc8, 0x5e, 0x1d, 0x5d, 0x5a, 0x6e, 0x79,
    0x72, 0x8f, 0x3a, 0xa9, 0x93, 0xec, 0x4c, 0x91,
    0x91, 0xd6, 0x8c, 0x61, 0x9f, 0xd9, 0x96, 0x59,
];
const ACTIVATION_SERVER: &str = "https://1344713238-grdts5pifw.ap-shanghai.tencentscf.com";
const TRIAL_DAYS: u64 = 3;          // 未联网激活时的试用天数
const TRIAL_SECS: u64 = TRIAL_DAYS * 86400;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub licensee: String,
    pub product: String,
    pub issued_at: u64,
    pub expires_at: u64,
    pub max_machines: u32,
    pub key_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivatedLicense {
    pub payload: LicensePayload,
    pub fingerprints: Vec<String>,
    pub activated_at: u64,
    pub online_verified: bool,
    pub activation_token: String,
    /// 本机首次激活时间（用于试用期判断）
    pub trial_started_at: u64,
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
    pub is_trial: bool,
    pub trial_days_left: Option<i64>,
    /// 是否允许进入程序
    pub can_access: bool,
    pub reason: String,
}

// ═══════════════════════════════════════════
// 硬件指纹
// ═══════════════════════════════════════════

fn machine_fingerprint() -> String {
    let mut hasher = Sha256::new();
    hasher.update(std::env::consts::OS.as_bytes());
    hasher.update(std::env::consts::ARCH.as_bytes());
    if let Ok(h) = hostname() { hasher.update(h.as_bytes()); }
    if let Ok(mac) = get_first_mac() { hasher.update(mac.as_bytes()); }
    let hash = hasher.finalize();
    hash.iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>().join("")[..16].to_string()
}

fn hostname() -> Result<String, ()> {
    if let Ok(h) = std::env::var("COMPUTERNAME") { return Ok(h.trim().into()); }
    if let Ok(h) = std::env::var("HOSTNAME") { return Ok(h.trim().into()); }
    if let Ok(out) = std::process::Command::new("hostname").output() {
        if let Ok(s) = String::from_utf8(out.stdout) { return Ok(s.trim().into()); }
    }
    Err(())
}

fn get_first_mac() -> Result<String, ()> {
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("ifconfig").args(["en0"]).output().map_err(|_| ())?;
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if line.contains("ether") {
                let p: Vec<&str> = line.split_whitespace().collect();
                if p.len() >= 2 { return Ok(p[1].replace(':', "").to_uppercase()); }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("getmac").output().map_err(|_| ())?;
        for p in String::from_utf8_lossy(&out.stdout).split_whitespace() {
            if p.len() == 17 && p.contains('-') { return Ok(p.replace('-', "").to_uppercase()); }
        }
    }
    Err(())
}

// ═══════════════════════════════════════════
// 签名验证
// ═══════════════════════════════════════════

fn public_key() -> Result<VerifyingKey, String> {
    VerifyingKey::from_bytes(&PUBLIC_KEY_BYTES.into()).map_err(|e| format!("公钥错误: {e}"))
}

fn verify_key(key: &str) -> Result<LicensePayload, String> {
    let cleaned: String = key.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase();
    let encoded = cleaned.strip_prefix("AGPT").unwrap_or(&cleaned);
    let decoded = base32_decode(encoded).map_err(|e| format!("注册码解码失败: {e}"))?;

    // 短码 v1: 12 bytes = 5B payload + 7B HMAC-SHA256 → 20 base32 chars → 6 segments
    if decoded.len() == 12 && decoded.first().map(|b| b >> 4) == Some(0x01) {
        return verify_short(&decoded);
    }

    // 长码: Ed25519 签名
    if decoded.len() < 64 { return Err("注册码格式不正确".into()); }
    let (sig_bytes, body) = decoded.split_at(64);
    let sig = Signature::from_slice(sig_bytes).map_err(|e| format!("签名错误: {e}"))?;
    public_key()?.verify(body, &sig).map_err(|_| "注册码无效：签名验证不通过".to_string())?;
    serde_json::from_slice(body).map_err(|e| format!("载荷错误: {e}"))
}

// ═══════════════════════════════════════════
// 短码验证 (HMAC-SHA256)
// ═══════════════════════════════════════════

fn short_hmac_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"agent-planet-short-license-v1");
    hasher.update(&PUBLIC_KEY_BYTES);
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

fn compute_short_hmac(payload: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(&short_hmac_key())
        .expect("HMAC key is always 32 bytes");
    mac.update(payload);
    let result = mac.finalize();
    let mut output = [0u8; 32];
    output.copy_from_slice(&result.into_bytes());
    output
}

/// 短码格式 v1: [version:4b|max-1:4b][expires_days:2B LE][key_id:2B][hmac:7B] = 12B
fn verify_short(data: &[u8]) -> Result<LicensePayload, String> {
    let payload = &data[..5];
    let hmac_received: [u8; 7] = data[5..12].try_into().unwrap();

    let expected = compute_short_hmac(payload);
    if hmac_received != expected[..7] {
        return Err("注册码无效：签名验证不通过".into());
    }

    let max_machines = ((data[0] & 0x0f) + 1) as u32;
    let expires_days = u16::from_le_bytes([data[1], data[2]]) as u64;
    let key_id = format!("{:02x}{:02x}", data[3], data[4]);

    let now = now_secs();
    let expires_at = if expires_days == 0 { 0 } else { now + expires_days * 86400 };

    Ok(LicensePayload {
        licensee: format!("短码-{}", &key_id[..4]),
        product: "ap".into(),
        issued_at: now,
        expires_at,
        max_machines,
        key_id,
    })
}

// ═══════════════════════════════════════════
// Base32
// ═══════════════════════════════════════════

const B32: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

fn base32_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut bits: u32 = 0; let mut count: u8 = 0; let mut out = Vec::new();
    for c in input.chars() {
        let v = B32.iter().position(|&x| x == c.to_ascii_uppercase() as u8)
            .ok_or_else(|| format!("无效字符: {c}"))?;
        bits = (bits << 5) | v as u32; count += 5;
        if count >= 8 {
            out.push((bits >> (count - 8)) as u8);
            count -= 8;
            bits &= (1u32 << count) - 1;
        }
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
    std::fs::write(&path, serde_json::to_string_pretty(l).map_err(|e| format!("json: {e}"))?)
        .map_err(|e| format!("write: {e}"))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
}

// ═══════════════════════════════════════════
// 在线激活
// ═══════════════════════════════════════════

fn activate_online(payload: &LicensePayload, fingerprint: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "key_id": payload.key_id, "fingerprint": fingerprint,
        "product": payload.product, "licensee": payload.licensee,
        "max_machines": payload.max_machines,
        "expires_at": payload.expires_at,
    });
    let client = reqwest::blocking::Client::new()
        .post(ACTIVATION_SERVER).json(&body)
        .timeout(std::time::Duration::from_secs(5)).send()
        .map_err(|e| format!("连接激活服务器失败: {e}"))?;
    if !client.status().is_success() {
        return Err(format!("激活被拒绝: {}", client.text().unwrap_or_default()));
    }
    let resp: serde_json::Value = client.json().map_err(|e| format!("响应: {e}"))?;
    resp["token"].as_str().map(|s| s.to_string()).ok_or_else(|| "服务器未返回令牌".into())
}

// ═══════════════════════════════════════════
// Tauri 命令
// ═══════════════════════════════════════════

/// 检查授权状态（程序启动时调用，决定是否锁屏）
#[tauri::command]
pub fn check_license() -> LicenseStatus {
    let Some(license) = read_license() else {
        return LicenseStatus {
            activated: false, licensee: String::new(), product: String::new(),
            expires_at: 0, is_expired: false, machines_used: 0, max_machines: 0,
            days_remaining: None, online_verified: false, is_trial: false,
            trial_days_left: None, can_access: false,
            reason: "未激活，请输入注册码".into(),
        };
    };
    build_status(&license)
}

/// 激活注册码
#[tauri::command]
pub fn activate_license(key: String) -> Result<LicenseStatus, String> {
    let payload = verify_key(&key)?;
    let now = now_secs();

    // 检查到期
    if payload.expires_at > 0 && now > payload.expires_at {
        return Err("注册码已过期".into());
    }

    let fp = machine_fingerprint();
    let mut license = read_license().unwrap_or(ActivatedLicense {
        payload: payload.clone(), fingerprints: Vec::new(),
        activated_at: now, online_verified: false,
        activation_token: String::new(), trial_started_at: now,
    });

    // 如果这个机器之前已经在线激活过 → 直接放行
    if license.online_verified && license.fingerprints.contains(&fp) {
        return Ok(build_status(&license));
    }

    // 本机是新机器 → 必须先在线激活
    // 先更新试用开始时间（如果还没设置）
    if license.trial_started_at == 0 {
        license.trial_started_at = now;
    }

    // 尝试在线激活
    match activate_online(&payload, &fp) {
        Ok(token) => {
            license.online_verified = true;
            license.activation_token = token;
            if !license.fingerprints.contains(&fp) {
                // 检查数量限制
                if license.fingerprints.len() >= payload.max_machines as usize {
                    return Err(format!(
                        "已达到最大激活数 ({}/{})。请购买更多授权。",
                        license.fingerprints.len(), payload.max_machines
                    ));
                }
                license.fingerprints.push(fp);
            }
            license.activated_at = now;
            write_license(&license)?;
        }
        Err(e) => {
            // 在线激活失败 → 检查试用期
            let trial_end = license.trial_started_at + TRIAL_SECS;
            if now > trial_end {
                return Err(format!(
                    "激活失败: {e}\n\n试用期已过（{TRIAL_DAYS}天），请联网后重试。"
                ));
            }
            // 试用期内，更新本地记录
            if !license.fingerprints.contains(&fp) {
                license.fingerprints.push(fp);
            }
            license.activated_at = now;
            write_license(&license)?;
        }
    }

    Ok(build_status(&license))
}

fn build_status(l: &ActivatedLicense) -> LicenseStatus {
    let now = now_secs();
    let is_expired = l.payload.expires_at > 0 && now > l.payload.expires_at;
    let trial_end = l.trial_started_at + TRIAL_SECS;
    let is_trial = !l.online_verified;
    let trial_days = if is_trial && trial_end > now {
        Some(((trial_end - now) as f64 / 86400.0).ceil() as i64)
    } else { None };

    // 能否进入程序：已在线激活 OR 试用期内
    let can_access = l.online_verified || (is_trial && now <= trial_end);

    let reason = if !can_access {
        if !l.online_verified && now > trial_end {
            format!("试用期已过（{TRIAL_DAYS}天），请联网激活")
        } else if is_expired {
            "注册码已过期".into()
        } else {
            String::new()
        }
    } else if is_trial {
        format!("试用模式，剩余 {} 天", trial_days.unwrap_or(0))
    } else {
        String::new()
    };

    LicenseStatus {
        activated: true,
        licensee: l.payload.licensee.clone(),
        product: l.payload.product.clone(),
        expires_at: l.payload.expires_at,
        is_expired,
        machines_used: l.fingerprints.len(),
        max_machines: l.payload.max_machines,
        days_remaining: if l.payload.expires_at > 0 {
            Some(((l.payload.expires_at - now) as f64 / 86400.0).ceil() as i64)
        } else { None },
        online_verified: l.online_verified,
        is_trial,
        trial_days_left: trial_days,
        can_access,
        reason,
    }
}

#[allow(dead_code)]
pub fn generate_keypair() -> (SigningKey, VerifyingKey) {
    let mut csprng = OsRng;
    let sk = SigningKey::generate(&mut csprng);
    let vk = sk.verifying_key();
    (sk, vk)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base32_roundtrip() {
        // 验证 JS BigInt + masking 编码能被 Rust u32 解码器正确解码
        let input = b"{\"licensee\":\"1\",\"product\":\"ap\"}";
        // 用 JS 端 base32Encode 对 input 编码的输出
        let js_encoded = "RNTG24MDNXZHG3MFEJ7CENKCFSTHA6VRNT4YG7BCHJTGC6BCRW";
        let decoded = base32_decode(js_encoded).unwrap();
        assert_eq!(&decoded[..], &input[..], "base32 round-trip failed");
    }

    #[test]
    fn test_verify_key_strips_agpt_prefix() {
        // 构造一个完整的 AGPT-...-... 格式密钥，测试前缀剥离和签名验证
        // 用 JS 生成的有效密钥（AGPT- 前缀 + dash 分隔）
        let code = std::include_str!("../../licenses-100.txt")
            .lines().next().expect("no codes").trim();
        // 验证格式
        assert!(code.starts_with("AGPT-"), "key should start with AGPT-");
        // 完整验证
        let payload = verify_key(code).expect("verify should succeed");
        assert_eq!(payload.product, "ap");
        assert_eq!(payload.expires_at, 0);
        assert_eq!(payload.max_machines, 3);
    }
}
