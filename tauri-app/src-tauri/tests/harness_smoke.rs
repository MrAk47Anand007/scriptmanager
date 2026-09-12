// Marker integration test: its existence lets build.rs attach the
// Common-Controls manifest to every test harness binary (see build.rs).
#[test]
fn harness_smoke() {
    assert!(true);
}
