# AI Agent System Instructions

This repository operates on a bleeding-edge React Native/Expo stack that requires highly specific build workarounds. All AI agents, assistants, and copilots must strictly adhere to the following architectural constraints when operating in this codebase.

## 1. NDK 27 C++ Linker Constraint (CRITICAL)
This project uses React Native 0.86 and Expo SDK 57, which requires NDK 27. 
* **The Vulnerability:** Third-party native modules will fail to compile under NDK 27 with `undefined symbol: operator delete` and `std::mutex` errors because their `CMakeLists.txt` files do not explicitly link `c++_shared`.
* **The Fix:** The root `android/build.gradle` file contains a global interceptor (`plugins.withId('com.android.library')`) that forces the injection of `-DCMAKE_SHARED_LINKER_FLAGS=-lc++_shared`. 
* **The Directive:** You must **never** remove, alter, or suggest refactoring the `plugins.withId` CMake argument block in the root `android/build.gradle`. If you are modifying Android build files, treat that block as immutable.

## 2. ADB Port Conflict Awareness
The host machine runs Native Instruments hardware services that occupy TCP ports in the 5554-5585 range (specifically port 5562). ADB will mistake these services for an offline Android emulator (`emulator-5562`) and crash the Expo CLI when trying to deploy the app.
* **The Directive:** If the user encounters ADB connection refused errors on port 5562, do not suggest restarting the emulator. Tell the user to restrict ADB's port range by running `$env:ADB_LOCAL_TRANSPORT_MAX_PORT="5555"`, killing the ADB server, and restarting it.