# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is RustDesk

RustDesk is an open-source remote desktop application written in Rust with a Flutter UI. It supports Windows, macOS, Linux, Android, and iOS. The Rust core handles all networking, screen capture, codec, and platform I/O; Flutter handles the UI. They communicate via `flutter_rust_bridge` (v1.80.1).

## Build Requirements

- **Rust**: minimum 1.75 (use 1.81 on macOS)
- **Flutter**: 3.24.5 (3.44.0 for Windows ARM64)
- **vcpkg** with `VCPKG_ROOT` set; install: `libvpx libyuv opus aom`
  - Windows: `vcpkg install libvpx:x64-windows-static libyuv:x64-windows-static opus:x64-windows-static aom:x64-windows-static`
  - Linux/macOS: `vcpkg install libvpx libyuv opus aom`
- C++ build tools (LLVM/Clang, CMake, NASM)

## Common Commands

### Rust (core library + Sciter desktop, deprecated UI path)
```sh
cargo build                   # debug build
cargo run                     # run with Sciter UI (requires sciter.dll/so/dylib in target/debug/)
cargo build --release
cargo test                    # run all tests
cargo test <test_name>        # run a single test
cargo clippy                  # lint
cargo fmt                     # format
```

### Flutter (primary UI path for all platforms)
```sh
# From the flutter/ directory:
flutter pub get
flutter run -d <device>       # run on connected device/desktop
flutter build apk             # Android
flutter build ios
flutter build windows
flutter build macos
flutter build linux
flutter analyze               # lint Dart code
```

### Regenerating the flutter_rust_bridge FFI bindings
The generated files (`src/bridge_generated.rs`, `flutter/lib/bridge_generated.dart`) must be regenerated whenever `src/flutter_ffi.rs` changes:
```sh
flutter_rust_bridge_codegen \
  --rust-input src/flutter_ffi.rs \
  --dart-output flutter/lib/bridge_generated.dart
```
CI uses `flutter_rust_bridge_codegen` v1.80.1 and `cargo-expand` v1.0.95. The bridge workflow runs on Linux; check `.github/workflows/bridge.yml` for the exact invocation.

## Architecture

### Rust crates (`libs/`)
| Crate | Purpose |
|---|---|
| `libs/hbb_common` | Config, TCP/UDP wrappers, protobuf messages, file-transfer helpers |
| `libs/scrap` | Cross-platform screen capture |
| `libs/enigo` | Platform keyboard/mouse injection |
| `libs/clipboard` | File copy-paste (Windows, Linux, macOS) |
| `libs/virtual_display` | Windows virtual display driver |
| `libs/remote_printer` | Remote printer redirection |

### Rust source (`src/`)
| File/Dir | Purpose |
|---|---|
| `src/server/` | Services exposed to incoming connections: `audio_service`, `video_service`, `display_service`, `input_service`, `clipboard_service`, `terminal_service`, `printer_service` |
| `src/client.rs` | Initiates outgoing peer connections |
| `src/client/io_loop.rs` | Main async I/O loop for a client session |
| `src/rendezvous_mediator.rs` | Registers with rendezvous server; handles TCP hole-punching and relay fallback |
| `src/platform/` | Platform-specific implementations (Windows, Linux, macOS) |
| `src/flutter_ffi.rs` | All FFI functions exposed to Flutter via flutter_rust_bridge — this is the FFI boundary |
| `src/flutter.rs` | Flutter-side Rust helpers (event channels, session management) |
| `src/ipc.rs` | IPC between the GUI process and the background service process |
| `src/ui_interface.rs` | Interface functions for both Sciter and Flutter UIs |
| `src/lang/` | i18n string tables (one file per locale) |
| `src/ui/` | **Deprecated** Sciter UI — do not modify |

### Flutter UI (`flutter/lib/`)
- `flutter/lib/main.dart` — app entry point
- `flutter/lib/desktop/` — desktop-specific pages and widgets
- `flutter/lib/mobile/` — mobile-specific pages and widgets
- `flutter/lib/common/widgets/` — shared widgets
- `flutter/lib/models/` — state models (`model.dart` is the main session model; `native_model.dart` wraps FFI calls)
- `flutter/lib/native/` — direct FFI call wrappers

## Key Design Patterns

**Two UI modes**: The codebase supports both the deprecated Sciter UI (`src/ui/`) and the current Flutter UI. The Flutter path is gated behind the `flutter` feature flag or `target_os = "android"/"ios"`. Don't mix the two.

**Service architecture**: The server side runs a set of platform services (video, audio, input, clipboard) as independent async loops in `src/server/`. Each service implements the `service.rs` `Service` trait and communicates through channels.

**IPC**: On desktop, the Flutter UI process and the background service process communicate over a Unix socket / named pipe via `src/ipc.rs`. The service process runs elevated to capture input and display.

**Feature flags**:
- `flutter` — enables FFI bridge and Flutter-specific code
- `hwcodec` — hardware video codec (NVENC/AMF/VideoToolbox)
- `vram` — GPU memory path for video (x86/x64 Windows only)
- `mediacodec` — Android MediaCodec
- `inline` — single-process inline mode

**Protobuf**: Messages are defined in `libs/hbb_common/protos/` and compiled at build time. The `hbb_common::message_proto` module re-exports all types.
