#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use keyring::Entry;
use serde::{Deserialize, Serialize};

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
            delete_vercel_project,
            list_supabase_projects
        ])
        .run(tauri::generate_context!())
        .expect("error while running watermonkey application");
}
