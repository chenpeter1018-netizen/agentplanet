//! Hermes Provider Registry — 16-provider catalog focused on Chinese AI
//! platforms plus key international providers.
//!
//! Each provider defines its auth scheme, env vars, base URL, transport,
//! and known model catalog. The frontend shows these as shortcut presets.
//!
//! This module is intentionally self-contained: it must NOT depend on any
//! runtime state. The static data is queried by commands in `hermes.rs`
//! and surfaced to the frontend via `hermes_list_providers`.

use serde::Serialize;

// =============================================================================
// Data model
// =============================================================================

/// Auth scheme matching upstream `auth.py::ProviderConfig.auth_type`.
///
/// - `api_key`: traditional env-var based key (`<PROVIDER>_API_KEY`, etc.)
/// - `oauth_device_code`: interactive device-code OAuth flow (Nous)
/// - `oauth_external`: OAuth handled by external process (Codex, Qwen)
/// - `external_process`: backing process handles auth (Copilot ACP)
pub const AUTH_API_KEY: &str = "api_key";

/// Transport negotiated with the provider.
pub const TRANSPORT_OPENAI_CHAT: &str = "openai_chat";
pub const TRANSPORT_ANTHROPIC: &str = "anthropic_messages";
pub const TRANSPORT_GOOGLE: &str = "google_gemini";

/// `/models` probe strategy used by `hermes_fetch_models`.
///
/// Note: all OpenAI-compatible providers (including Gemini via its OpenAI
/// adapter) use `PROBE_OPENAI`. A separate `PROBE_GOOGLE` was considered for
/// native Google Gemini API probing, but in practice every provider we
/// support uses one of these three strategies.
pub const PROBE_OPENAI: &str = "openai";
pub const PROBE_ANTHROPIC: &str = "anthropic";
pub const PROBE_NONE: &str = "none";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesProvider {
    /// Stable identifier (matches upstream PROVIDER_REGISTRY keys).
    pub id: &'static str,
    /// Human-readable display name.
    pub name: &'static str,
    /// See AUTH_* constants above.
    pub auth_type: &'static str,
    /// Default inference base URL.
    pub base_url: &'static str,
    /// Env var name for overriding `base_url` (empty string = none).
    pub base_url_env_var: &'static str,
    /// Env vars checked in priority order for API key (empty for OAuth/external).
    pub api_key_env_vars: &'static [&'static str],
    /// See TRANSPORT_* constants above.
    pub transport: &'static str,
    /// See PROBE_* constants above.
    pub models_probe: &'static str,
    /// Known static model list (subset of upstream _PROVIDER_MODELS).
    pub models: &'static [&'static str],
    /// True for aggregators/routers (OpenRouter, AI Gateway, etc.) — users
    /// must explicitly specify a model since there is no sensible default.
    pub is_aggregator: bool,
    /// Hint for the UI when the CLI must be used for login (OAuth providers).
    pub cli_auth_hint: &'static str,
}

// =============================================================================
// Static registry — 16 providers
// =============================================================================

const P_DEEPSEEK: HermesProvider = HermesProvider {
    id: "deepseek",
    name: "DeepSeek",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.deepseek.com/v1",
    base_url_env_var: "DEEPSEEK_BASE_URL",
    api_key_env_vars: &["DEEPSEEK_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &["deepseek-chat", "deepseek-reasoner"],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_SILICONFLOW: HermesProvider = HermesProvider {
    id: "siliconflow",
    name: "硅基流动",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.siliconflow.cn/v1",
    base_url_env_var: "SILICONFLOW_BASE_URL",
    api_key_env_vars: &["SILICONFLOW_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "deepseek-ai/DeepSeek-V3",
        "deepseek-ai/DeepSeek-R1",
        "Qwen/Qwen3-235B-A22B",
        "Qwen/QwQ-32B",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_VOLCENGINE: HermesProvider = HermesProvider {
    id: "volcengine",
    name: "火山引擎",
    auth_type: AUTH_API_KEY,
    base_url: "https://ark.cn-beijing.volces.com/api/v3",
    base_url_env_var: "VOLCENGINE_BASE_URL",
    api_key_env_vars: &["VOLCENGINE_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "deepseek-v3-250324",
        "deepseek-r1-250528",
        "doubao-1.5-pro-256k",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_ALIYUN: HermesProvider = HermesProvider {
    id: "aliyun",
    name: "阿里云百炼",
    auth_type: AUTH_API_KEY,
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    base_url_env_var: "DASHSCOPE_BASE_URL",
    api_key_env_vars: &["DASHSCOPE_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "qwen3.5-plus",
        "qwen3-coder-plus",
        "qwen3-coder-next",
        "qwen-plus",
        "qwen-max",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_ZHIPU: HermesProvider = HermesProvider {
    id: "zhipu",
    name: "智谱 AI",
    auth_type: AUTH_API_KEY,
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    base_url_env_var: "ZHIPU_BASE_URL",
    api_key_env_vars: &["ZHIPU_API_KEY", "GLM_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "glm-5.1",
        "glm-5",
        "glm-4.7",
        "glm-4.5",
        "glm-4.5-flash",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_MINIMAX: HermesProvider = HermesProvider {
    id: "minimax",
    name: "MiniMax",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.minimaxi.com/v1",
    base_url_env_var: "MINIMAX_BASE_URL",
    api_key_env_vars: &["MINIMAX_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "MiniMax-M2.7",
        "MiniMax-M2.5",
        "MiniMax-M2.1",
        "MiniMax-M2",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_MOONSHOT: HermesProvider = HermesProvider {
    id: "moonshot",
    name: "Moonshot / Kimi",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.moonshot.ai/v1",
    base_url_env_var: "MOONSHOT_BASE_URL",
    api_key_env_vars: &["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "kimi-k2.6",
        "kimi-k2.5",
        "kimi-k2-thinking",
        "kimi-k2-turbo-preview",
        "kimi-latest",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_OPENAI: HermesProvider = HermesProvider {
    id: "openai",
    name: "OpenAI 官方",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.openai.com/v1",
    base_url_env_var: "OPENAI_BASE_URL",
    api_key_env_vars: &["OPENAI_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "gpt-4o",
        "gpt-4o-mini",
        "o3-mini",
        "gpt-4.1",
        "gpt-4.1-mini",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_ANTHROPIC: HermesProvider = HermesProvider {
    id: "anthropic",
    name: "Anthropic 官方",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.anthropic.com",
    base_url_env_var: "",
    api_key_env_vars: &[
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
    ],
    transport: TRANSPORT_ANTHROPIC,
    models_probe: PROBE_ANTHROPIC,
    models: &[
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_GEMINI: HermesProvider = HermesProvider {
    id: "gemini",
    name: "Google Gemini",
    auth_type: AUTH_API_KEY,
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    base_url_env_var: "GEMINI_BASE_URL",
    api_key_env_vars: &["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_XAI: HermesProvider = HermesProvider {
    id: "xai",
    name: "xAI (Grok)",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.x.ai/v1",
    base_url_env_var: "XAI_BASE_URL",
    api_key_env_vars: &["XAI_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &["grok-4.20-reasoning", "grok-4-1-fast-reasoning"],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_GROQ: HermesProvider = HermesProvider {
    id: "groq",
    name: "Groq",
    auth_type: AUTH_API_KEY,
    base_url: "https://api.groq.com/openai/v1",
    base_url_env_var: "GROQ_BASE_URL",
    api_key_env_vars: &["GROQ_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "llama-3.3-70b-versatile",
        "mixtral-8x7b-32768",
        "deepseek-r1-distill-llama-70b",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_OPENROUTER: HermesProvider = HermesProvider {
    id: "openrouter",
    name: "OpenRouter",
    auth_type: AUTH_API_KEY,
    base_url: "https://openrouter.ai/api/v1",
    base_url_env_var: "OPENROUTER_BASE_URL",
    api_key_env_vars: &["OPENROUTER_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[],
    is_aggregator: true,
    cli_auth_hint: "",
};

const P_NVIDIA: HermesProvider = HermesProvider {
    id: "nvidia",
    name: "NVIDIA NIM",
    auth_type: AUTH_API_KEY,
    base_url: "https://integrate.api.nvidia.com/v1",
    base_url_env_var: "NVIDIA_BASE_URL",
    api_key_env_vars: &["NVIDIA_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[
        "meta/llama-3.3-70b-instruct",
        "mistralai/mixtral-8x7b-instruct-v0.1",
    ],
    is_aggregator: false,
    cli_auth_hint: "",
};

const P_OLLAMA: HermesProvider = HermesProvider {
    id: "ollama",
    name: "Ollama (本地)",
    auth_type: AUTH_API_KEY,
    base_url: "http://127.0.0.1:11434/v1",
    base_url_env_var: "OLLAMA_BASE_URL",
    api_key_env_vars: &[],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[],
    is_aggregator: true,
    cli_auth_hint: "",
};

const P_CUSTOM: HermesProvider = HermesProvider {
    id: "custom",
    name: "自定义模型渠道",
    auth_type: AUTH_API_KEY,
    base_url: "",
    base_url_env_var: "OPENAI_BASE_URL",
    api_key_env_vars: &["CUSTOM_API_KEY", "OPENAI_API_KEY"],
    transport: TRANSPORT_OPENAI_CHAT,
    models_probe: PROBE_OPENAI,
    models: &[],
    is_aggregator: true,
    cli_auth_hint: "",
};

/// Full provider registry. Order is the UI display order.
pub const ALL_PROVIDERS: &[HermesProvider] = &[
    P_DEEPSEEK,
    P_SILICONFLOW,
    P_VOLCENGINE,
    P_ALIYUN,
    P_ZHIPU,
    P_MINIMAX,
    P_MOONSHOT,
    P_OPENAI,
    P_ANTHROPIC,
    P_GEMINI,
    P_XAI,
    P_GROQ,
    P_OPENROUTER,
    P_NVIDIA,
    P_OLLAMA,
    P_CUSTOM,
];

// =============================================================================
// Query helpers
// =============================================================================

/// Look up a provider by stable id.
pub fn get_provider(id: &str) -> Option<&'static HermesProvider> {
    ALL_PROVIDERS.iter().find(|p| p.id == id)
}

/// Primary env var for writing the API key for a given provider.
/// Returns `None` for OAuth / external_process providers.
pub fn primary_api_key_env(provider_id: &str) -> Option<&'static str> {
    get_provider(provider_id).and_then(|p| p.api_key_env_vars.first().copied())
}

/// Env var for overriding the base URL (empty string if provider has no such var).
pub fn primary_base_url_env(provider_id: &str) -> Option<&'static str> {
    get_provider(provider_id).and_then(|p| {
        if p.base_url_env_var.is_empty() {
            None
        } else {
            Some(p.base_url_env_var)
        }
    })
}

/// All env var keys that Agent Planet manages across every provider.
/// Used by `configure_hermes::merge_env_file` to know which keys to clear
/// when the user switches providers. This is the union of:
///   - all `api_key_env_vars` across providers
///   - all non-empty `base_url_env_var` values
///   - the two Agent Planet-specific env vars (`GATEWAY_ALLOW_ALL_USERS`,
///     `API_SERVER_KEY`)
pub fn all_managed_env_keys() -> Vec<&'static str> {
    let mut out: Vec<&'static str> = Vec::new();
    for p in ALL_PROVIDERS {
        for ev in p.api_key_env_vars {
            if !out.contains(ev) {
                out.push(ev);
            }
        }
        if !p.base_url_env_var.is_empty() && !out.contains(&p.base_url_env_var) {
            out.push(p.base_url_env_var);
        }
    }
    // Agent Planet-specific keys
    for extra in &["GATEWAY_ALLOW_ALL_USERS", "API_SERVER_KEY"] {
        if !out.contains(extra) {
            out.push(extra);
        }
    }
    out
}

/// Given the set of env var keys present in a `.env` file, infer the most
/// likely provider. Priority follows `ALL_PROVIDERS` order, so users who have
/// multiple provider keys set will be identified with the first matching
/// canonical provider.
pub fn infer_provider_from_env_keys(keys: &[&str]) -> Option<&'static str> {
    for p in ALL_PROVIDERS {
        if p.api_key_env_vars.is_empty() {
            continue; // Skip OAuth/external
        }
        for ev in p.api_key_env_vars {
            if keys.contains(ev) {
                return Some(p.id);
            }
        }
    }
    None
}

/// Find the first provider whose static model catalog contains the given model
/// name (exact match). Returns `None` on ambiguity (multiple matches) or miss.
pub fn find_provider_by_model(model: &str) -> Option<&'static str> {
    let hits: Vec<&'static str> = ALL_PROVIDERS
        .iter()
        .filter(|p| p.models.contains(&model))
        .map(|p| p.id)
        .collect();
    if hits.len() == 1 {
        Some(hits[0])
    } else {
        None
    }
}

// =============================================================================
// Tauri command
// =============================================================================

/// Return the full provider registry for the frontend. The list is static —
/// clients can cache it for the lifetime of the session.
#[tauri::command]
pub fn hermes_list_providers() -> Vec<HermesProvider> {
    ALL_PROVIDERS.to_vec()
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_expected_providers() {
        assert_eq!(ALL_PROVIDERS.len(), 16);
        assert!(get_provider("deepseek").is_some());
        assert!(get_provider("siliconflow").is_some());
        assert!(get_provider("volcengine").is_some());
        assert!(get_provider("aliyun").is_some());
        assert!(get_provider("zhipu").is_some());
        assert!(get_provider("minimax").is_some());
        assert!(get_provider("moonshot").is_some());
        assert!(get_provider("openai").is_some());
        assert!(get_provider("anthropic").is_some());
        assert!(get_provider("gemini").is_some());
        assert!(get_provider("xai").is_some());
        assert!(get_provider("groq").is_some());
        assert!(get_provider("openrouter").is_some());
        assert!(get_provider("nvidia").is_some());
        assert!(get_provider("ollama").is_some());
        assert!(get_provider("custom").is_some());
        assert!(get_provider("nonexistent").is_none());
    }

    #[test]
    fn primary_api_key_env_picks_first() {
        assert_eq!(primary_api_key_env("anthropic"), Some("ANTHROPIC_API_KEY"));
        assert_eq!(primary_api_key_env("gemini"), Some("GOOGLE_API_KEY"));
        assert_eq!(primary_api_key_env("zhipu"), Some("ZHIPU_API_KEY"));
        assert_eq!(primary_api_key_env("ollama"), None);
    }

    #[test]
    fn all_managed_env_keys_covers_everything() {
        let keys = all_managed_env_keys();
        assert!(keys.contains(&"ANTHROPIC_API_KEY"));
        assert!(keys.contains(&"DEEPSEEK_API_KEY"));
        assert!(keys.contains(&"GOOGLE_API_KEY"));
        assert!(keys.contains(&"GEMINI_BASE_URL"));
        assert!(keys.contains(&"OPENAI_API_KEY"));
        assert!(keys.contains(&"SILICONFLOW_API_KEY"));
        assert!(keys.contains(&"GATEWAY_ALLOW_ALL_USERS"));
        assert!(keys.contains(&"API_SERVER_KEY"));
        // No duplicates
        for i in 0..keys.len() {
            for j in (i + 1)..keys.len() {
                assert_ne!(keys[i], keys[j], "duplicate: {}", keys[i]);
            }
        }
    }

    #[test]
    fn infer_provider_from_env_keys_follows_registry_order() {
        // DeepSeek appears before Anthropic in ALL_PROVIDERS, so if both are present
        // the DeepSeek entry wins.
        let keys = vec!["ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY"];
        assert_eq!(infer_provider_from_env_keys(&keys), Some("deepseek"));

        // Only DeepSeek set → matches deepseek.
        let keys = vec!["DEEPSEEK_API_KEY"];
        assert_eq!(infer_provider_from_env_keys(&keys), Some("deepseek"));

        // Secondary anthropic env var still matches.
        let keys = vec!["ANTHROPIC_TOKEN"];
        assert_eq!(infer_provider_from_env_keys(&keys), Some("anthropic"));

        // Unknown key → no match.
        let keys = vec!["UNRELATED_KEY"];
        assert_eq!(infer_provider_from_env_keys(&keys), None);
    }

    #[test]
    fn find_provider_by_model_is_unambiguous() {
        assert_eq!(find_provider_by_model("deepseek-chat"), Some("deepseek"));
        assert_eq!(
            find_provider_by_model("kimi-k2.5"),
            Some("moonshot")
        );
        // Unknown model
        assert_eq!(find_provider_by_model("nonexistent"), None);
    }
}
