# Test VMs

- No password required for SSH.
- `su - root` should work; password is `123` if needed.

---

## Ubuntu Desktop Minimal

```bash
ssh virtuser@localhost -p 2222
```

## Manjaro KDE

```bash
ssh virtuser@localhost -p 2223
```

## Fedora 43 Workstation

```bash
ssh virtuser@localhost -p 2224
```

## Pop!_OS Cosmic

```bash
ssh virtuser@localhost -p 2225
```

---

## Copy debug binary to VM

When asked to "copy to VM X" or similar, copy the debug binary to the specified VM.

**Source:** `target/debug/insight-reader` (build with `cargo build` if needed)

**Destination:** `~/.local/bin/insight-reader` on all VMs

**Process:**

1. Build debug binary: `cargo build` (if not already built).
2. SCP to VM: `scp -P <PORT> target/debug/insight-reader virtuser@localhost:/tmp/insight-reader`
3. SSH and replace: `ssh -p <PORT> virtuser@localhost "cp /tmp/insight-reader ~/.local/bin/insight-reader && chmod +x ~/.local/bin/insight-reader"`

Use the port for the target VM (2222–2225 as above).
