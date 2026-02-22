//! OS-provided machine identifier for best-effort device identification.
//! No extra permissions required; readable by normal user processes.

/// Returns the OS machine ID if available. Used to form the installation header value.
pub fn get_machine_id() -> Option<String> {
    #[cfg(target_os = "linux")]
    return get_machine_id_linux();

    #[cfg(target_os = "windows")]
    return get_machine_id_windows();

    #[cfg(target_os = "macos")]
    return get_machine_id_macos();

    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    None
}

#[cfg(target_os = "linux")]
fn get_machine_id_linux() -> Option<String> {
    std::fs::read_to_string("/etc/machine-id")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(target_os = "windows")]
fn get_machine_id_windows() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .ok()?;
    let guid: String = key.get_value("MachineGuid").ok()?;
    if guid.trim().is_empty() {
        return None;
    }
    Some(guid.trim().to_string())
}

#[cfg(target_os = "macos")]
fn get_machine_id_macos() -> Option<String> {
    use std::process::Command;

    let out = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    // Line like: "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" — use second quoted string.
    for line in s.lines() {
        if !line.contains("IOPlatformUUID") {
            continue;
        }
        let mut in_quote = false;
        let mut start = 0;
        let mut count = 0;
        for (i, c) in line.char_indices() {
            if c == '"' {
                if !in_quote {
                    in_quote = true;
                    start = i + 1;
                } else {
                    in_quote = false;
                    count += 1;
                    if count == 2 {
                        let value = line[start..i].trim();
                        if !value.is_empty() && value.contains('-') {
                            return Some(value.to_string());
                        }
                        break;
                    }
                }
            }
        }
    }
    None
}
