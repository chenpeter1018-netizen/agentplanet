/// Agent Planet ZeroClaw 引擎命令模块
/// 便携版独立二进制管理器：检测/安装/启停/状态/快照/恢复/健康检查

use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use futures_util::{SinkExt, StreamExt};

fn planet_data_root() -> PathBuf {
    super::openclaw_dir().join("agent-planet")
}

type Result<T> = std::result::Result<T, String>;

static ZEROCLAW_PID: Mutex<Option<u32>> = Mutex::new(None);

fn zeroclaw_data_root() -> PathBuf {
    planet_data_root().join("zeroclaw")
}

fn zeroclaw_bin() -> PathBuf {
    zeroclaw_data_root().join("bin").join(zeroclaw_bin_name())
}

fn zeroclaw_bin_name() -> &'static str {
    #[cfg(target_os = "windows")]
    { "zeroclaw.exe" }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "zeroclaw-aarch64" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "zeroclaw-linux" }
    #[cfg(not(target_os = "windows"))]
    { "zeroclaw" }
}

fn zeroclaw_config_dir() -> PathBuf {
    zeroclaw_data_root().join("config")
}

fn zeroclaw_knowledge_dir() -> PathBuf {
    zeroclaw_data_root().join("knowledge")
}

fn zeroclaw_logs_dir() -> PathBuf {
    zeroclaw_data_root().join("logs")
}

fn zeroclaw_pid_file() -> PathBuf {
    zeroclaw_data_root().join(".pid")
}

fn ensure_dirs() {
    let _ = std::fs::create_dir_all(zeroclaw_data_root().join("bin"));
    let _ = std::fs::create_dir_all(zeroclaw_config_dir());
    let _ = std::fs::create_dir_all(zeroclaw_knowledge_dir());
    let _ = std::fs::create_dir_all(zeroclaw_logs_dir());
}

fn read_pid() -> Option<u32> {
    std::fs::read_to_string(zeroclaw_pid_file())
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

fn write_pid(pid: u32) {
    let _ = std::fs::write(zeroclaw_pid_file(), pid.to_string());
}

fn clear_pid() {
    let _ = std::fs::remove_file(zeroclaw_pid_file());
}

fn is_process_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("tasklist")
            .args(["/fi", &format!("PID eq {}", pid)])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

/// 获取 ZeroClaw 侦听端口（从 config.toml 或 zeroclaw.json 读取，缺省 18790）
fn zeroclaw_port() -> u16 {
    // v0.7.5+ 使用 config.toml
    let toml_path = zeroclaw_config_dir().join("config.toml");
    if let Ok(content) = std::fs::read_to_string(&toml_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("port = ") || line.starts_with("port=") {
                if let Some(val) = line.split('=').nth(1) {
                    if let Ok(p) = val.trim().parse::<u16>() {
                        if p > 0 { return p }
                    }
                }
            }
        }
    }
    // 兼容旧版 zeroclaw.json
    let json_path = zeroclaw_config_dir().join("zeroclaw.json");
    if let Ok(content) = std::fs::read_to_string(&json_path) {
        if let Ok(val) = serde_json::from_str::<Value>(&content) {
            if let Some(port) = val.get("port").and_then(|p| p.as_u64()) {
                if port > 0 && port < 65536 {
                    return port as u16;
                }
            }
        }
    }
    18790
}

/// 检测 ZeroClaw 状态：是否安装、版本、运行状态
#[tauri::command]
pub async fn check_zeroclaw() -> Result<Value> {
    ensure_dirs();
    let bin = zeroclaw_bin();
    let installed = bin.exists();
    let mut version: Option<String> = None;
    let mut running = false;
    let mut pid: Option<u32> = None;

    if installed {
        if let Ok(output) = std::process::Command::new(&bin)
            .arg("--version")
            .output()
        {
            version = String::from_utf8(output.stdout).ok().map(|s| s.trim().to_string());
        }
    }

    // 检查是否在运行
    if let Some(saved_pid) = read_pid() {
        if is_process_alive(saved_pid) {
            running = true;
            pid = Some(saved_pid);
        } else {
            clear_pid();
        }
    }

    Ok(serde_json::json!({
        "installed": installed,
        "version": version,
        "running": running,
        "pid": pid,
        "port": zeroclaw_port(),
        "bin_path": bin.to_string_lossy(),
        "config_dir": zeroclaw_config_dir().to_string_lossy(),
        "knowledge_dir": zeroclaw_knowledge_dir().to_string_lossy(),
        "logs_dir": zeroclaw_logs_dir().to_string_lossy(),
        "data_dir": zeroclaw_data_root().to_string_lossy(),
    }))
}

/// 检测文件是否为真实可执行二进制（非脚本占位符）
pub fn is_valid_binary(path: &std::path::Path) -> bool {
    if let Ok(data) = std::fs::read(path) {
        if data.is_empty() { return false }
        // 脚本文件（#!/bin/sh, #!/bin/bash, @echo off 等）
        if data.starts_with(b"#!") { return false }
        if data.starts_with(b"@echo") { return false }
        if data.starts_with(b"REM ") || data.starts_with(b"rem ") { return false }
        // Windows PE 可执行文件 (MZ 魔数)
        if data.starts_with(b"MZ") { return true }
        // macOS Mach-O 魔数 (4 种字节序变体)
        if data.starts_with(&[0xFE, 0xED, 0xFA, 0xCE]) { return true }
        if data.starts_with(&[0xFE, 0xED, 0xFA, 0xCF]) { return true }
        if data.starts_with(&[0xCF, 0xFA, 0xED, 0xFE]) { return true }
        if data.starts_with(&[0xCE, 0xFA, 0xED, 0xFE]) { return true }
        // Linux ELF (0x7F 'E' 'L' 'F')
        if data.starts_with(&[0x7F, b'E', b'L', b'F']) { return true }
        // 其他情况保守通过（可能是未识别的二进制格式）
        // 至少检查前128字节是否包含足够非文本内容
        let printable = data.iter().take(128).filter(|b| b.is_ascii_graphic() || b.is_ascii_whitespace()).count();
        return printable < 100 // 真正的二进制文件会有很多非可打印字节
    }
    false
}

/// 从 Tauri 资源目录复制内嵌的 zeroclaw 二进制到数据目录（离线免下载）
fn install_bundled_zeroclaw(app: &tauri::AppHandle) -> std::result::Result<PathBuf, String> {
    let bin_dir = zeroclaw_data_root().join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    let bin_path = zeroclaw_bin();

    // 1. Tauri v2 生产模式 — 通过 AppHandle 解析资源目录
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("binaries").join(zeroclaw_bin_name());
        if bundled.exists() && is_valid_binary(&bundled) {
            std::fs::copy(&bundled, &bin_path).map_err(|e| format!("复制失败: {}", e))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(&bin_path).map_err(|e| e.to_string())?.permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(&bin_path, perms).map_err(|e| e.to_string())?;
            }
            return Ok(bin_path);
        }
    }

    // 2. 开发模式 — CARGO_MANIFEST_DIR/binaries
    let dev_bin = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(zeroclaw_bin_name());
    if dev_bin.exists() && is_valid_binary(&dev_bin) {
        std::fs::copy(&dev_bin, &bin_path).map_err(|e| format!("复制失败: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&bin_path).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&bin_path, perms).map_err(|e| e.to_string())?;
        }
        return Ok(bin_path);
    }

    Err("bundled binary not found".into())
}

/// 安装/更新 ZeroClaw 二进制（优先离线内嵌 → 镜像下载 → GitHub）
#[tauri::command]
pub async fn install_zeroclaw(app: tauri::AppHandle, url: Option<String>, mirror_url: Option<String>) -> Result<Value> {
    ensure_dirs();

    // 1. 优先使用内嵌二进制（离线，无需网络）
    if let Ok(bin_path) = install_bundled_zeroclaw(&app) {
        write_version(&bin_path);
        return Ok(serde_json::json!({ "ok": true, "path": bin_path.to_string_lossy(), "source": "bundled" }));
    }

    // 2. 在线下载
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    // 下载文件名（匹配 GitHub Release 实际 asset 名称）
    let (asset_name, is_zip) = match (os, arch) {
        ("macos", "aarch64") => ("zeroclaw-aarch64-apple-darwin.tar.gz", false),
        ("macos", _) => ("zeroclaw-x86_64-apple-darwin.tar.gz", false),
        ("windows", _) => ("zeroclaw-x86_64-pc-windows-msvc.zip", true),
        ("linux", "aarch64") => ("zeroclaw-aarch64-unknown-linux-gnu.tar.gz", false),
        _ => ("zeroclaw-x86_64-unknown-linux-gnu.tar.gz", false),
    };

    // 下载 URL 优先级：用户传入 > GitHub Releases
    let mut urls: Vec<String> = Vec::new();
    if let Some(u) = url {
        urls.push(u);
    } else if let Some(mirror) = mirror_url {
        urls.push(format!("{}/{}", mirror.trim_end_matches('/'), asset_name));
    }
    // GitHub 兜底
    urls.push(format!("https://github.com/zeroclaw-labs/zeroclaw/releases/download/v0.7.5/{}", asset_name));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err = String::new();
    let mut bytes = None;
    for download_url in &urls {
        match client.get(download_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.bytes().await {
                    Ok(b) => { bytes = Some(b); break; }
                    Err(e) => last_err = format!("读取失败: {e}"),
                }
            }
            Ok(resp) => last_err = format!("HTTP {}（该地址可能在中国大陆无法访问，请尝试使用镜像地址）", resp.status()),
            Err(e) => last_err = format!("网络请求失败: {}（请检查网络连接或 VPN）", e),
        }
    }
    let bytes = bytes.ok_or_else(|| format!("下载失败（已尝试 {} 个地址）: {last_err}", urls.len()))?;

    // 解压并提取 zeroclaw 二进制
    let bin_dir = zeroclaw_data_root().join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    let bin_path = zeroclaw_bin();

    if is_zip {
        let reader = std::io::Cursor::new(&bytes);
        let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("ZIP 解析失败: {e}"))?;
        let mut found = false;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| format!("ZIP 条目读取失败: {e}"))?;
            if file.name().ends_with("zeroclaw.exe") {
                let mut out = std::fs::File::create(&bin_path).map_err(|e| format!("创建文件失败: {e}"))?;
                std::io::copy(&mut file, &mut out).map_err(|e| format!("写入失败: {e}"))?;
                found = true;
                break;
            }
        }
        if !found { return Err("ZIP 中未找到 zeroclaw.exe".into()); }
    } else {
        // tar.gz 解压
        let decoder = flate2::read::GzDecoder::new(&bytes[..]);
        let mut archive = tar::Archive::new(decoder);
        let mut found = false;
        for entry in archive.entries().map_err(|e| format!("tar 解析失败: {e}"))? {
            let mut entry = entry.map_err(|e| format!("tar 条目错误: {e}"))?;
            if let Ok(path) = entry.path() {
                if path.ends_with("zeroclaw") || path.file_name().map_or(false, |n| n == "zeroclaw") {
                    entry.unpack(&bin_path).map_err(|e| format!("解压失败: {e}"))?;
                    found = true;
                    break;
                }
            }
        }
        if !found { return Err("tar.gz 中未找到 zeroclaw 二进制".into()); }
    }

    // Unix: 确保可执行
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&bin_path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&bin_path, perms).map_err(|e| e.to_string())?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&bin_path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&bin_path, perms).map_err(|e| e.to_string())?;
    }

    write_version(&bin_path);
    Ok(serde_json::json!({ "ok": true, "path": bin_path.to_string_lossy(), "source": "download" }))
}

fn write_version(bin_path: &PathBuf) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(output) = std::process::Command::new(bin_path)
            .arg("--version")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            if let Ok(ver) = String::from_utf8(output.stdout) {
                let _ = std::fs::write(zeroclaw_data_root().join("VERSION"), ver.trim());
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(output) = std::process::Command::new(bin_path).arg("--version").output() {
            if let Ok(ver) = String::from_utf8(output.stdout) {
                let _ = std::fs::write(zeroclaw_data_root().join("VERSION"), ver.trim());
            }
        }
    }
}

/// ZeroClaw 健康检查
#[tauri::command]
pub async fn zeroclaw_health_check() -> Result<Value> {
    let bin = zeroclaw_bin();
    if !bin.exists() {
        return Ok(serde_json::json!({ "healthy": false, "reason": "binary not found" }));
    }
    let output = std::process::Command::new(&bin).arg("--version").output().ok();
    let version = output.and_then(|o| String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string()));
    Ok(serde_json::json!({ "healthy": version.is_some(), "version": version }))
}

/// 启动 ZeroClaw 守护进程
#[tauri::command]
pub async fn zeroclaw_start() -> Result<Value> {
    let bin = zeroclaw_bin();
    if !bin.exists() {
        return Err("ZeroClaw 二进制不存在，请先安装".into());
    }

    // 检查是否已在运行
    if let Some(pid) = read_pid() {
        if is_process_alive(pid) {
            return Ok(serde_json::json!({ "ok": true, "already_running": true, "pid": pid }));
        }
        clear_pid();
    }

    ensure_dirs();

    let port = zeroclaw_port().to_string();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let child = std::process::Command::new(&bin)
            .args(["gateway", "start", "-p", &port, "--config-dir", &zeroclaw_config_dir().to_string_lossy()])
            .current_dir(zeroclaw_data_root())
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("启动失败: {}", e))?;
        write_pid(child.id());
        Ok(serde_json::json!({ "ok": true, "pid": child.id() }))
    }
    #[cfg(not(windows))]
    {
        let child = std::process::Command::new(&bin)
            .args(["gateway", "start", "-p", &port, "--config-dir", &zeroclaw_config_dir().to_string_lossy()])
            .current_dir(zeroclaw_data_root())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("启动失败: {}", e))?;
        write_pid(child.id());
        Ok(serde_json::json!({ "ok": true, "pid": child.id() }))
    }
}

/// 停止 ZeroClaw 守护进程
#[tauri::command]
pub async fn zeroclaw_stop() -> Result<Value> {
    if let Some(pid) = read_pid() {
        if is_process_alive(pid) {
            #[cfg(windows)]
            {
                std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/F"])
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status()
                    .ok();
            }
            #[cfg(not(windows))]
            {
                std::process::Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .status()
                    .ok();
            }
        }
        clear_pid();
    }
    Ok(serde_json::json!({ "ok": true }))
}

/// 重启 ZeroClaw 守护进程
#[tauri::command]
pub async fn zeroclaw_restart() -> Result<Value> {
    zeroclaw_stop().await?;
    // 短暂等待端口释放
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    zeroclaw_start().await
}

/// 运行时探测（TCP 端口是否在监听）
#[tauri::command]
pub async fn zeroclaw_runtime_probe() -> Result<Value> {
    let port = zeroclaw_port();
    let addr = format!("127.0.0.1:{}", port);
    let ok = tokio::net::TcpStream::connect(&addr).await.is_ok();
    Ok(serde_json::json!({ "listening": ok, "port": port }))
}

/// 创建快照（备份 agentplanet.json 和 zeroclaw 配置）
#[tauri::command]
pub async fn zeroclaw_create_snapshot(name: String) -> Result<Value> {
    let snap_dir = zeroclaw_data_root().join("snapshots");
    std::fs::create_dir_all(&snap_dir).map_err(|e| e.to_string())?;

    let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let snap_name = format!("{}_{}", name, ts);
    let snap_path = snap_dir.join(&snap_name);
    std::fs::create_dir_all(&snap_path).map_err(|e| e.to_string())?;

    let sources = [
        planet_data_root().join("agentplanet.json"),
        zeroclaw_config_dir().join("zeroclaw.json"),
    ];
    for src in &sources {
        if src.exists() {
            if let Some(fname) = src.file_name() {
                let _ = std::fs::copy(src, snap_path.join(fname));
            }
        }
    }
    Ok(serde_json::json!({ "ok": true, "name": snap_name, "path": snap_path.to_string_lossy() }))
}

/// 列出快照
#[tauri::command]
pub async fn zeroclaw_list_snapshots() -> Result<Value> {
    let snap_dir = zeroclaw_data_root().join("snapshots");
    if !snap_dir.exists() {
        return Ok(serde_json::json!([]));
    }
    let mut snaps = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&snap_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();
                snaps.push(serde_json::json!({ "name": name }));
            }
        }
    }
    Ok(serde_json::json!(snaps))
}

/// 恢复快照
#[tauri::command]
pub async fn zeroclaw_restore_snapshot(name: String) -> Result<Value> {
    let snap_dir = zeroclaw_data_root().join("snapshots");
    let snap_path = snap_dir.join(&name);
    if !snap_path.exists() {
        return Err(format!("快照不存在: {}", name));
    }
    // 恢复 agentplanet.json
    let agentplanet_src = snap_path.join("agentplanet.json");
    if agentplanet_src.exists() {
        let dest = planet_data_root().join("agentplanet.json");
        std::fs::copy(&agentplanet_src, &dest).map_err(|e| e.to_string())?;
    }
    // 恢复 zeroclaw.json
    let zc_config_src = snap_path.join("zeroclaw.json");
    if zc_config_src.exists() {
        let dest = zeroclaw_config_dir().join("zeroclaw.json");
        std::fs::copy(&zc_config_src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({ "ok": true }))
}

/// 打开 ZeroClaw 目录（知识库/日志/配置）
#[tauri::command]
pub async fn zeroclaw_open_dir(kind: String) -> Result<Value> {
    let dir = match kind.as_str() {
        "knowledge" => zeroclaw_knowledge_dir(),
        "logs" => zeroclaw_logs_dir(),
        "config" => zeroclaw_config_dir(),
        "data" => zeroclaw_data_root(),
        _ => zeroclaw_data_root(),
    };
    ensure_dirs();
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    Ok(serde_json::json!({ "ok": true }))
}

fn zeroclaw_token_file() -> PathBuf {
    zeroclaw_data_root().join(".token")
}

fn read_token() -> Option<String> {
    std::fs::read_to_string(zeroclaw_token_file())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn write_token(token: &str) {
    let _ = std::fs::write(zeroclaw_token_file(), token);
}

/// 自动配对 ZeroClaw Gateway：从日志中提取配对码，POST /pair 获取 token
async fn auto_pair(port: u16) -> Option<String> {
    // 读取网关日志查找配对码
    let log_file = zeroclaw_logs_dir().join("zeroclaw.log");
    if let Ok(log) = std::fs::read_to_string(&log_file) {
        // 在日志中匹配 ┌──────────────┐ ... │  918305  │ ... └──────────────┘ 中的 6 位数字
        for line in log.lines().rev() {
            let trimmed = line.trim();
            if let Some(code_start) = trimmed.find('│') {
                let inner = &trimmed[code_start..];
                if let Some(code) = inner.chars()
                    .filter(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .get(..6)
                {
                    let code = code.to_string();
                    if code.len() == 6 {
                        let client = reqwest::Client::new();
                        if let Ok(resp) = client
                            .post(format!("http://127.0.0.1:{}/pair", port))
                            .header("X-Pairing-Code", &code)
                            .send()
                            .await
                        {
                            if resp.status().is_success() {
                                if let Ok(json) = resp.json::<Value>().await {
                                    if let Some(token) = json.get("token").and_then(|t| t.as_str()) {
                                        write_token(token);
                                        return Some(token.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// 获取或执行配对，返回 bearer token
async fn ensure_paired(port: u16) -> Option<String> {
    if let Some(token) = read_token() {
        return Some(token);
    }
    auto_pair(port).await
}

/// HTTP 代理：转发请求到 ZeroClaw Gateway（用于前端聊天等）
#[tauri::command]
pub async fn zeroclaw_api_proxy(method: String, path: String, body: Option<Value>, headers: Option<Value>) -> Result<Value> {
    let port = zeroclaw_port();
    let url = format!("http://127.0.0.1:{}{}", port, path);
    let client = reqwest::Client::new();
    let req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("不支持的 HTTP 方法: {}", method)),
    };
    // 注入配对 token
    let req = if let Some(token) = ensure_paired(port).await {
        req.header("Authorization", format!("Bearer {}", token))
    } else {
        req
    };
    let req = if let Some(h) = &headers {
        if let Some(obj) = h.as_object() {
            let mut r = req;
            for (k, v) in obj {
                if let Some(vs) = v.as_str() {
                    r = r.header(k.as_str(), vs);
                }
            }
            r
        } else { req }
    } else { req };
    let req = if let Some(b) = &body {
        req.json(b)
    } else { req };
    let resp = req.send().await.map_err(|e| format!("Gateway 请求失败: {}", e))?;
    let status = resp.status().as_u16();
    let resp_body = resp.text().await.unwrap_or_default();
    let json_body: Value = serde_json::from_str(&resp_body).unwrap_or(Value::String(resp_body));
    Ok(serde_json::json!({ "status": status, "body": json_body }))
}

/// WebSocket 聊天代理：连接到 ZeroClaw Gateway 的 /ws/chat 端点
/// 通过 Tauri 事件向前端推送流式响应
#[tauri::command]
pub async fn zeroclaw_chat_send(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
) -> Result<Value> {
    let port = zeroclaw_port();
    let token = ensure_paired(port).await.unwrap_or_default();

    let ws_url = format!("ws://127.0.0.1:{}/ws/chat?token={}", port, token);

    let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .map_err(|e| format!("WebSocket 连接失败: {e}"))?;

    let (write, mut read) = ws_stream.split();

    // 发送消息
    let payload = serde_json::json!({
        "type": "message",
        "content": message,
        "session_id": session_id,
    });
    let msg = tokio_tungstenite::tungstenite::Message::Text(payload.to_string());
    let mut write = write;
    write.send(msg)
        .await
        .map_err(|e| format!("WebSocket 发送失败: {e}"))?;

    // 后台任务读取响应并发射事件
    let app_handle = app.clone();
    let sid = session_id.clone();
    tokio::spawn(async move {
        let mut full_response = String::new();
        while let Some(msg) = read.next().await {
            match msg {
                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                    let data: Value = match serde_json::from_str(&text) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let msg_type = data["type"].as_str().unwrap_or("");
                    match msg_type {
                        "chunk" => {
                            let delta = data["content"].as_str().unwrap_or("");
                            full_response.push_str(delta);
                            let _ = app_handle.emit(
                                "zeroclaw-chat-chunk",
                                serde_json::json!({
                                    "session_id": sid,
                                    "delta": delta,
                                }),
                            );
                        }
                        "tool_call" => {
                            let _ = app_handle.emit(
                                "zeroclaw-chat-tool",
                                serde_json::json!({
                                    "session_id": sid,
                                    "name": data["name"],
                                    "args": data["args"],
                                    "status": "running",
                                }),
                            );
                        }
                        "tool_result" => {
                            let _ = app_handle.emit(
                                "zeroclaw-chat-tool",
                                serde_json::json!({
                                    "session_id": sid,
                                    "name": data["name"],
                                    "content": data["content"],
                                    "status": "done",
                                }),
                            );
                        }
                        "done" => {
                            let _ = app_handle.emit(
                                "zeroclaw-chat-done",
                                serde_json::json!({
                                    "session_id": sid,
                                    "full_response": full_response,
                                    "model": data["model"],
                                    "usage": data["usage"],
                                }),
                            );
                            return;
                        }
                        "error" => {
                            let _ = app_handle.emit(
                                "zeroclaw-chat-error",
                                serde_json::json!({
                                    "session_id": sid,
                                    "error": data["message"],
                                }),
                            );
                            return;
                        }
                        _ => {}
                    }
                }
                Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                    if !full_response.is_empty() {
                        let _ = app_handle.emit(
                            "zeroclaw-chat-done",
                            serde_json::json!({
                                "session_id": sid,
                                "full_response": full_response,
                            }),
                        );
                    }
                    return;
                }
                Err(e) => {
                    let _ = app_handle.emit(
                        "zeroclaw-chat-error",
                        serde_json::json!({
                            "session_id": sid,
                            "error": format!("WebSocket 错误: {e}"),
                        }),
                    );
                    return;
                }
                _ => {}
            }
        }
    });

    Ok(serde_json::json!({ "ok": true, "session_id": session_id }))
}
