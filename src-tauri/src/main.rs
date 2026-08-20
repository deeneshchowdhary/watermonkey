#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Result of a credential probe. Outcomes are a closed vocabulary shared with
/// `src/lib/credentialTester.js` so the UI can distinguish invalid credentials,
/// insufficient permissions, and transport failures.
#[derive(Serialize)]
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

/// Read-only reachability check for the Supabase management token. Mirrors the
/// request `list_supabase_projects` makes so the probe exercises the same scope.
#[tauri::command]
async fn test_supabase_credentials(token: String) -> Result<CredentialProbe, String> {
    if token.trim().is_empty() {
        return Ok(probe(
            "not_configured",
            "Add a Supabase management access token before testing.",
        ));
    }

    let response = reqwest::Client::new()
        .get("https://api.supabase.com/v1/projects")
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
    let client = reqwest::Client::new();
    let url = format!("https://api.vercel.com/v9/projects/{}", project_id);

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

#[derive(Deserialize, Serialize)]
struct SupabaseProject {
    id: String,
    name: String,
    region: String,
    status: String,
}

#[tauri::command]
async fn list_supabase_projects(token: String) -> Result<Vec<SupabaseProject>, String> {
    let response = reqwest::Client::new()
        .get("https://api.supabase.com/v1/projects")
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
