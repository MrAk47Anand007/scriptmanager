use std::env;

fn main() {
    tauri_build::build();

    // Test harness binaries link rfd/tao objects that import comctl32 v6
    // entry points (TaskDialogIndirect, SetWindowSubclass). tauri-build
    // embeds the Common-Controls side-by-side manifest only into bin
    // targets, so `cargo test` binaries fail to load with
    // STATUS_ENTRYPOINT_NOT_FOUND. Delay-loading comctl32 removes the
    // startup binding for every target; in the app the DLL still resolves
    // to v6 through the embedded manifest at first use, and in test
    // harnesses those dialog functions are never called.
    if env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
        println!("cargo:rustc-link-lib=dylib=delayimp");
    }
}
