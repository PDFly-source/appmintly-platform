# Emulator runtime dependency (CI fallback)

`libpulse-emulator-deps.tgz` holds the libpulse 16.1 runtime that the Android
emulator (37.x) links even when it is started with `-no-audio`:

```
libpulse.so.0  libpulsecommon-16.1.so  libsndfile.so.1  libasyncns.so.0
libFLAC.so.12  libvorbis.so.0  libvorbisenc.so.2  libopus.so.0  libogg.so.0
libmpg123.so.0  libmp3lame.so.0
```

Without it `qemu-system-x86_64` aborts at load time with
`libpulse.so.0: cannot open shared object file`.

The splash QA workflow first tries `apt-get install libpulse0`. When the runner's
package mirror is unreachable (DNS failures are common) it unpacks this archive
into `/usr/local/lib/pulse`, registers it with `ldconfig` and asserts that
`libpulse.so.0` resolves with no missing sonames. The archive only contains
sonames that are absent from the standard runner image, so nothing else on the
runner is shadowed.

Provenance: Debian bookworm (glibc 2.36, forward compatible with the runner's
glibc 2.39), packages `libpulse0`, `libpulse-mainloop-glib0`, `libsndfile1`,
`libasyncns0`, `libflac12`, `libvorbis0a`, `libvorbisenc2`, `libopus0`, `libogg0`,
`libmpg123-0`, `libmp3lame0`, stripped with `strip --strip-unneeded`.
