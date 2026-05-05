/// Agent Planet ZeroClaw 引擎命令模块
/// 便携版检测/快照/恢复/健康检查

use crate::commands::CommandResult;
use crate::planet_data_root;
use serde_json::Value;
use std::path::PathBuf;

type Result<T> = CommandResult<T>;

fn zeroclaw_data_root() -> PathBuf {
    planet_data_root().join("zeroclaw")
}

/// 检测 ZeroClaw 安装
#[tauri::command]
pub async fn check_zeroclaw() -> Result<Value> {
    let dir = zeroclaw_data_root();
    let bin = dir.join("zeroclaw");
    Ok(serde_json::json!({
        "installed": bin.exists(),
        "data_dir": dir.to_string_lossy(),
    }))
}

/// 安装 ZeroClaw 二进制
#[tauri::command]
pub async fn install_zeroclaw(url: Option<String>) -> Result<Value> {
    let dir = zeroclaw_data_root();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let download_url = url.unwrap_or_else(|| {
        "https://github.com/zeroclaw/zeroclaw/releases/latest/download/zeroclaw-macos-arm64".into()
    });

    // 使用 reqwest 下载
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let bin_path = dir.join("zeroclaw");
    std::fs::write(&bin_path, &bytes).map_err(|e| e.to_string())?;

    // 设置可执行权限
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&bin_path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&bin_path, perms).map_err(|e| e.to_string())?;
    }

    Ok(serde_json::json!({ "ok": true, "path": bin_path.to_string_lossy() }))
}

/// ZeroClaw 健康检测
#[tauri::command]
pub async fn zeroclaw_health_check() -> Result<Value> {
    let bin = zeroclaw_data_root().join("zeroclaw");
    if !bin.exists() {
        return Ok(serde_json::json!({ "healthy": false, "reason": "binary not found" }));
    }
    let output = std::process::Command::new(&bin)
        .arg("--version")
        .output()
        .ok();
    let version = output.and_then(|o| String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string()));
    Ok(serde_json::json!({
        "healthy": version.is_some(),
        "version": version,
    }))
}

/// 创建快照
#[tauri::command]
pub async fn zeroclaw_create_snapshot(name: String) -> Result<Value> {
    let snap_dir = zeroclaw_data_root().join("snapshots");
    std::fs::create_dir_all(&snap_dir).map_err(|e| e.to_string())?;

    let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let snap_name = format!("{}_{}", name, ts);
    let snap_path = snap_dir.join(&snap_name);
    std::fs::create_dir_all(&snap_path).map_err(|e| e.to_string())?;

    // 快照配置目录
    let config_src = planet_data_root().join("agentplanet.json");
    if config_src.exists() {
        std::fs::copy(&config_src, snap_path.join("agentplanet.json")).ok();
    }

    Ok(serde_json::json!({
        "ok": true,
        "name": snap_name,
        "path": snap_path.to_string_lossy(),
    }))
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
    let config_src = snap_path.join("agentplanet.json");
    if config_src.exists() {
        let dest = planet_data_root().join("agentplanet.json");
        std::fs::copy(&config_src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({ "ok": true }))
}
