#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Result of a credential probe. Outcomes are a closed vocabulary shared with
/// `src/lib/credentialTester.js` so the UI can distinguish invalid credentials,
/// insufficient permissions, and transport failures.
#[derive(Serialize, Debug, Clone, PartialEq)]
struct CredentialProbe {
    outcome: String,
    message: String,
}

fn probe(outcome: &str, message: impl Into<String>) -> CredentialProbe {
    CredentialProbe {
        outcome: outcome.to_string(),
        message: message.into(),
    }
}

#[tauri::command]
fn save_credentials(provider: String, key_id: String, secret_key: String) -> Result<(), String> {
    let service_id = format!("watermonkey_{}", provider.to_lowercase());

    let entry_key = Entry::new(&service_id, "access_key_id").map_err(|e| e.to_string())?;
    entry_key.set_password(&key_id).map_err(|e| e.to_string())?;

    let entry_secret = Entry::new(&service_id, "secret_access_key").map_err(|e| e.to_string())?;
    entry_secret.set_password(&secret_key).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_credentials(provider: String) -> Result<(String, String), String> {
    let service_id = format!("watermonkey_{}", provider.to_lowercase());

    let entry_key = Entry::new(&service_id, "access_key_id").map_err(|e| e.to_string())?;
    let key_id = entry_key.get_password().map_err(|e| e.to_string())?;

    let entry_secret = Entry::new(&service_id, "secret_access_key").map_err(|e| e.to_string())?;
    let secret_key = entry_secret.get_password().map_err(|e| e.to_string())?;

    Ok((key_id, secret_key))
}

/// Removes one keychain entry. A missing entry is treated as already removed so
/// that clearing a partially saved provider still succeeds.
fn forget_entry(service_id: &str, user: &str) -> Result<(), String> {
    let entry = Entry::new(service_id, user).map_err(|error| error.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_credentials(provider: String) -> Result<(), String> {
    let service_id = format!("watermonkey_{}", provider.to_lowercase());

    forget_entry(&service_id, "access_key_id")?;
    forget_entry(&service_id, "secret_access_key")?;

    Ok(())
}

const SUPABASE_API_BASE: &str = "https://api.supabase.com";
const VERCEL_API_BASE: &str = "https://api.vercel.com";

/// Read-only reachability check for the Supabase management token. Mirrors the
/// request `list_supabase_projects` makes so the probe exercises the same scope.
#[tauri::command]
async fn test_supabase_credentials(token: String) -> Result<CredentialProbe, String> {
    test_supabase_credentials_at(SUPABASE_API_BASE, token).await
}

async fn test_supabase_credentials_at(base_url: &str, token: String) -> Result<CredentialProbe, String> {
    if token.trim().is_empty() {
        return Ok(probe(
            "not_configured",
            "Add a Supabase management access token before testing.",
        ));
    }

    let response = reqwest::Client::new()
        .get(format!("{base_url}/v1/projects"))
        .bearer_auth(token)
        .timeout(Duration::from_secs(15))
        .send()
        .await;

    let response = match response {
        Ok(response) => response,
        // reqwest errors carry the URL and transport cause, never request headers.
        Err(error) => {
            let reason = if error.is_timeout() {
                "the request timed out".to_string()
            } else {
                error.to_string()
            };
            return Ok(probe(
                "network_error",
                format!("Could not reach the Supabase Management API ({reason})."),
            ));
        }
    };

    let status = response.status();
    if status.is_success() {
        let projects = response
            .json::<Vec<SupabaseProject>>()
            .await
            .map_err(|error| format!("Supabase returned an unexpected response: {error}"))?;
        return Ok(probe(
            "valid",
            format!(
                "Token accepted. {} project{} visible.",
                projects.len(),
                if projects.len() == 1 { "" } else { "s" }
            ),
        ));
    }

    // Response bodies are deliberately not surfaced: they can echo the request.
    Ok(match status.as_u16() {
        401 => probe(
            "invalid_credentials",
            "Supabase rejected the token (401). Generate a new management access token.",
        ),
        403 => probe(
            "insufficient_permissions",
            "The token is valid but lacks permission to list projects (403).",
        ),
        429 => probe(
            "rate_limited",
            "Supabase is rate limiting this token (429). Try again shortly.",
        ),
        code => probe(
            "provider_error",
            format!("Supabase Management API returned status {code}."),
        ),
    })
}

#[tauri::command]
async fn delete_vercel_project(token: String, project_id: String) -> Result<String, String> {
    delete_vercel_project_at(VERCEL_API_BASE, token, project_id).await
}

async fn delete_vercel_project_at(base_url: &str, token: String, project_id: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{base_url}/v9/projects/{}", project_id);

    let res = client.delete(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(format!("Successfully deleted Vercel project {}", project_id))
    } else {
        Err(format!("Vercel API returned status: {}", res.status()))
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
struct SupabaseProject {
    id: String,
    name: String,
    region: String,
    status: String,
}

#[tauri::command]
async fn list_supabase_projects(token: String) -> Result<Vec<SupabaseProject>, String> {
    list_supabase_projects_at(SUPABASE_API_BASE, token).await
}

async fn list_supabase_projects_at(base_url: &str, token: String) -> Result<Vec<SupabaseProject>, String> {
    let response = reqwest::Client::new()
        .get(format!("{base_url}/v1/projects"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("Could not connect to Supabase: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = if body.is_empty() { status.to_string() } else { format!("{status}: {body}") };
        return Err(format!("Supabase Management API rejected the request ({detail})"));
    }

    response
        .json::<Vec<SupabaseProject>>()
        .await
        .map_err(|error| format!("Supabase returned an unexpected response: {error}"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_credentials,
            get_credentials,
            delete_credentials,
            test_supabase_credentials,
            delete_vercel_project,
            list_supabase_projects
        ])
        .run(tauri::generate_context!())
        .expect("error while running watermonkey application");
}

// SPEC §6.14: provider HTTP calls mocked via `mockito`, base URL injected
// through the `_at` helpers above. Keychain-touching tests are marked
// `#[ignore]` (see the bottom of this module) since they need a real OS
// keychain (macOS Keychain / Windows Credential Manager / Secret Service)
// that a typical CI container doesn't have; run them explicitly with
// `cargo test -- --ignored` on a machine that has one.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_helper_builds_the_expected_shape() {
        let result = probe("valid", "ok");
        assert_eq!(result, CredentialProbe { outcome: "valid".to_string(), message: "ok".to_string() });
    }

    #[tokio::test]
    async fn test_supabase_credentials_reports_not_configured_without_a_token() {
        let result = test_supabase_credentials_at("https://unused.invalid", "".to_string()).await.unwrap();
        assert_eq!(result.outcome, "not_configured");
    }

    #[tokio::test]
    async fn test_supabase_credentials_reports_valid_on_success() {
        let mut server = mockito::Server::new_async().await;
        let mock = server.mock("GET", "/v1/projects")
            .match_header("authorization", "Bearer good-token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"[{"id":"p1","name":"a","region":"us-east-1","status":"ACTIVE_HEALTHY"}]"#)
            .create_async()
            .await;

        let result = test_supabase_credentials_at(&server.url(), "good-token".to_string()).await.unwrap();
        mock.assert_async().await;
        assert_eq!(result.outcome, "valid");
        assert!(result.message.contains('1'));
    }

    #[tokio::test]
    async fn test_supabase_credentials_classifies_401_as_invalid() {
        let mut server = mockito::Server::new_async().await;
        server.mock("GET", "/v1/projects").with_status(401).create_async().await;

        let result = test_supabase_credentials_at(&server.url(), "bad-token".to_string()).await.unwrap();
        assert_eq!(result.outcome, "invalid_credentials");
    }

    #[tokio::test]
    async fn test_supabase_credentials_classifies_403_as_insufficient_permissions() {
        let mut server = mockito::Server::new_async().await;
        server.mock("GET", "/v1/projects").with_status(403).create_async().await;

        let result = test_supabase_credentials_at(&server.url(), "token".to_string()).await.unwrap();
        assert_eq!(result.outcome, "insufficient_permissions");
    }

    #[tokio::test]
    async fn test_supabase_credentials_classifies_429_as_rate_limited() {
        let mut server = mockito::Server::new_async().await;
        server.mock("GET", "/v1/projects").with_status(429).create_async().await;

        let result = test_supabase_credentials_at(&server.url(), "token".to_string()).await.unwrap();
        assert_eq!(result.outcome, "rate_limited");
    }

    #[tokio::test]
    async fn test_supabase_credentials_never_echoes_the_response_body() {
        let mut server = mockito::Server::new_async().await;
        server.mock("GET", "/v1/projects")
            .with_status(400)
            .with_body("super-secret-internal-detail")
            .create_async()
            .await;

        let result = test_supabase_credentials_at(&server.url(), "token".to_string()).await.unwrap();
        assert!(!result.message.contains("super-secret-internal-detail"));
    }

    #[tokio::test]
    async fn list_supabase_projects_parses_a_successful_response() {
        let mut server = mockito::Server::new_async().await;
        server.mock("GET", "/v1/projects")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"[{"id":"p1","name":"a","region":"us-east-1","status":"INACTIVE"}]"#)
            .create_async()
            .await;

        let projects = list_supabase_projects_at(&server.url(), "token".to_string()).await.unwrap();
        assert_eq!(projects, vec![SupabaseProject { id: "p1".to_string(), name: "a".to_string(), region: "us-east-1".to_string(), status: "INACTIVE".to_string() }]);
    }

    #[tokio::test]
    async fn list_supabase_projects_surfaces_status_and_body_on_failure() {
        let mut server = mockito::Server::new_async().await;
        server.mock("GET", "/v1/projects").with_status(500).with_body("boom").create_async().await;

        let error = list_supabase_projects_at(&server.url(), "token".to_string()).await.unwrap_err();
        assert!(error.contains("500"));
        assert!(error.contains("boom"));
    }

    #[tokio::test]
    async fn delete_vercel_project_reports_success_message() {
        let mut server = mockito::Server::new_async().await;
        server.mock("DELETE", "/v9/projects/proj-1")
            .match_header("authorization", "Bearer token")
            .with_status(204)
            .create_async()
            .await;

        let message = delete_vercel_project_at(&server.url(), "token".to_string(), "proj-1".to_string()).await.unwrap();
        assert!(message.contains("proj-1"));
    }

    #[tokio::test]
    async fn delete_vercel_project_surfaces_provider_error_status() {
        let mut server = mockito::Server::new_async().await;
        server.mock("DELETE", "/v9/projects/proj-1").with_status(404).create_async().await;

        let error = delete_vercel_project_at(&server.url(), "token".to_string(), "proj-1".to_string()).await.unwrap_err();
        assert!(error.contains("404"));
    }

    // --- Real-keychain tests -------------------------------------------
    // Ignored by default since they need a real OS keychain; run explicitly
    // with `cargo test -- --ignored` on a machine that has one. Provider
    // names are distinctive test-only strings, never a real provider id, to
    // avoid touching anything a real run of the app might have saved.

    #[test]
    #[ignore = "touches the real OS keychain; not available in a typical CI container"]
    fn save_get_delete_credentials_round_trip() {
        let provider = "test_ci_probe_keychain_roundtrip".to_string();

        save_credentials(provider.clone(), "test-key-id".to_string(), "test-secret".to_string())
            .expect("save_credentials should succeed against a real keychain");

        let (key_id, secret_key) = get_credentials(provider.clone())
            .expect("get_credentials should read back what was just saved");
        assert_eq!(key_id, "test-key-id");
        assert_eq!(secret_key, "test-secret");

        delete_credentials(provider.clone()).expect("delete_credentials should succeed");

        let after_delete = get_credentials(provider);
        assert!(after_delete.is_err(), "credentials should be gone after delete_credentials");
    }

    #[test]
    #[ignore = "touches the real OS keychain; not available in a typical CI container"]
    fn forget_entry_treats_a_missing_entry_as_already_removed() {
        let result = forget_entry("watermonkey_test_ci_probe_that_never_existed", "access_key_id");
        assert!(result.is_ok());
    }

    #[test]
    #[ignore = "touches the real OS keychain; not available in a typical CI container"]
    fn delete_credentials_is_idempotent_when_nothing_was_saved() {
        let provider = "test_ci_probe_never_saved".to_string();
        let result = delete_credentials(provider);
        assert!(result.is_ok(), "deleting credentials that were never saved should not error");
    }
}
