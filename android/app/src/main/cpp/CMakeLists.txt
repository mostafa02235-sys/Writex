# Writex AI on-device engine: llama.cpp + a small JNI bridge.
# llama.cpp itself is not committed; scripts/fetch-llama.sh downloads the pinned
# release into ./llama.cpp (the GitHub Actions build does this automatically).
cmake_minimum_required(VERSION 3.22.1)
project(writex_llama C CXX)

set(LLAMA_DIR ${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp)
if(NOT EXISTS ${LLAMA_DIR}/CMakeLists.txt)
  message(FATAL_ERROR "llama.cpp is missing. Run: bash scripts/fetch-llama.sh")
endif()

# Always optimise the engine, also in debug builds (an unoptimised build is ~10x slower)
set(CMAKE_C_FLAGS_DEBUG "-O2 -g0")
set(CMAKE_CXX_FLAGS_DEBUG "-O2 -g0")
set(CMAKE_C_FLAGS_RELEASE "-O3 -DNDEBUG")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)   # run on every phone of this CPU family
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)   # ggml's own thread pool
add_subdirectory(${LLAMA_DIR} llama-build)

add_library(writex_llama SHARED writex_llama.cpp)
target_link_libraries(writex_llama llama android log)
