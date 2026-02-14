// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut args = std::env::args().skip(1);
    if let Some(command) = args.next() {
        if command == "action" {
            let Some(action) = args.next() else {
                eprintln!("Usage: insight-reader action <read-selected|pause|stop>");
                std::process::exit(2);
            };

            match insight_reader_2_lib::send_action_to_running_instance(&action) {
                Ok(()) => return,
                Err(_) => {
                    std::env::set_var("INSIGHT_READER_START_ACTION", action);
                }
            }
        }
    }

    insight_reader_2_lib::run()
}
