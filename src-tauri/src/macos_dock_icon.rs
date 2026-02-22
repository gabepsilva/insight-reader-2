//! macOS Dock icon restoration when switching from Accessory to Regular activation policy.
//!
//! When we hide the app from the Dock (Accessory) and later restore (Regular), macOS sometimes
//! shows a generic icon. We explicitly set the application icon from our bundled logo to fix this.

use objc::msg_send;
use objc::runtime::{Class, Object};

use crate::tray::TRAY_ICON_PNG;

/// Sets the application icon in the Dock to our bundled logo.
/// Call this after set_activation_policy(Regular) when restoring from tray hide.
pub fn restore_dock_icon() {
    unsafe {
        let ns_data_class = Class::get("NSData").expect("NSData class");
        let ns_image_class = Class::get("NSImage").expect("NSImage class");
        let ns_app_class = Class::get("NSApplication").expect("NSApplication class");

        // NSData *data = [NSData dataWithBytes:bytes length:length];
        let data: *mut Object = msg_send![ns_data_class, dataWithBytes: TRAY_ICON_PNG.as_ptr() length: TRAY_ICON_PNG.len()];

        if data.is_null() {
            tracing::warn!("Failed to create NSData from icon bytes");
            return;
        }

        // NSImage *image = [[NSImage alloc] initWithData:data];
        let image_alloc: *mut Object = msg_send![ns_image_class, alloc];
        let image: *mut Object = msg_send![image_alloc, initWithData: data];

        if image.is_null() {
            let _: () = msg_send![image_alloc, release];
            tracing::warn!("Failed to create NSImage from icon data");
            return;
        }

        // NSApp = [NSApplication sharedApplication]
        let ns_app: *mut Object = msg_send![ns_app_class, sharedApplication];
        // [NSApp setApplicationIconImage:image]
        let _: () = msg_send![ns_app, setApplicationIconImage: image];

        let _: () = msg_send![image, release];
    }
}
