package serial

import (
	"errors"
	"fmt"
	"io"
	"os"
	"testing"
	"time"
)

func TestManagerConnectCreatesConnectedSession(t *testing.T) {
	port := NewPort("/dev/ttyUSB0")
	manager := NewManager("/dev/ttyUSB0", 10*time.Second, fakeFactory{
		open: func(device string) (Port, error) {
			if device != "/dev/ttyUSB0" {
				t.Fatalf("unexpected device %q", device)
			}
			return port, nil
		},
	})
	manager.now = func() time.Time { return time.Unix(1700000000, 0).UTC() }
	manager.newStreamID = func() string { return "stream-1" }

	session, err := manager.Connect()
	if err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	if session.StreamID != "stream-1" {
		t.Fatalf("unexpected stream id: %q", session.StreamID)
	}

	if session.State != StateConnected {
		t.Fatalf("unexpected session state: %q", session.State)
	}

	if manager.State() != StateConnected {
		t.Fatalf("unexpected manager state: %q", manager.State())
	}
}

func TestManagerConnectFailureSetsErrorState(t *testing.T) {
	manager := NewManager("/dev/ttyUSB0", 10*time.Second, fakeFactory{
		open: func(string) (Port, error) {
			return nil, errors.New("open failed")
		},
	})

	_, err := manager.Connect()
	if err == nil {
		t.Fatal("expected connect error")
	}

	if manager.State() != StateError {
		t.Fatalf("expected error state, got %q", manager.State())
	}
}

func TestManagerReconnectRollsStreamID(t *testing.T) {
	var ids []string
	manager := NewManager("/dev/ttyUSB0", 10*time.Second, fakeFactory{
		open: func(string) (Port, error) {
			return NewPort("/dev/ttyUSB0"), nil
		},
	})
	manager.now = func() time.Time { return time.Unix(1700000000, 0).UTC() }
	manager.newStreamID = func() string {
		id := "stream-1"
		if len(ids) > 0 {
			id = "stream-2"
		}
		ids = append(ids, id)
		return id
	}

	first, err := manager.Connect()
	if err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	second, err := manager.Reconnect()
	if err != nil {
		t.Fatalf("Reconnect returned error: %v", err)
	}

	if first.StreamID == second.StreamID {
		t.Fatalf("expected stream id rollover, got %q", first.StreamID)
	}

	if manager.State() != StateConnected {
		t.Fatalf("expected connected state after reconnect, got %q", manager.State())
	}
}

func TestManagerDisconnectWithoutSessionIsSafe(t *testing.T) {
	manager := NewManager("/dev/ttyUSB0", 10*time.Second, nil)

	if err := manager.Disconnect(StateDisconnected); err != nil {
		t.Fatalf("Disconnect returned error: %v", err)
	}

	if manager.State() != StateDisconnected {
		t.Fatalf("unexpected state: %q", manager.State())
	}
}

func TestManagerGettersAndCurrentSession(t *testing.T) {
	manager := NewManager("/dev/ttyUSB0", 15*time.Second, fakeFactory{
		open: func(string) (Port, error) {
			return NewPort("/dev/ttyUSB0"), nil
		},
	})
	manager.now = func() time.Time { return time.Unix(1700000000, 0).UTC() }
	manager.newStreamID = func() string { return "stream-1" }

	if manager.Device() != "/dev/ttyUSB0" {
		t.Fatalf("unexpected device: %q", manager.Device())
	}

	if manager.ReconnectInterval() != 15*time.Second {
		t.Fatalf("unexpected reconnect interval: %v", manager.ReconnectInterval())
	}

	if session, ok := manager.CurrentSession(); ok || session != nil {
		t.Fatal("expected no current session before connect")
	}

	connected, err := manager.Connect()
	if err != nil {
		t.Fatalf("Connect returned error: %v", err)
	}

	current, ok := manager.CurrentSession()
	if !ok {
		t.Fatal("expected current session after connect")
	}

	if current.StreamID != connected.StreamID {
		t.Fatalf("unexpected current session stream id: %q", current.StreamID)
	}
}

func TestUnsupportedFactoryAndMemoryPortBehavior(t *testing.T) {
	factory := NewUnsupportedFactory()
	if _, err := factory.Open("/dev/ttyUSB0"); err == nil {
		t.Fatal("expected unsupported factory to return error")
	}

	port := NewPort("/dev/ttyUSB0")

	buf := make([]byte, 8)
	n, err := port.Read(buf)
	if n != 0 || !errors.Is(err, io.EOF) {
		t.Fatalf("expected EOF read, got n=%d err=%v", n, err)
	}

	written, err := port.Write([]byte{1, 2, 3})
	if err != nil {
		t.Fatalf("Write returned error: %v", err)
	}

	if written != 3 {
		t.Fatalf("expected 3 bytes written, got %d", written)
	}
}

func TestOSFactoryOpenReturnsFileBackedPort(t *testing.T) {
	tmpFile, err := os.CreateTemp(t.TempDir(), "serial-port-*")
	if err != nil {
		t.Fatalf("CreateTemp returned error: %v", err)
	}
	tmpPath := tmpFile.Name()
	if err := tmpFile.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}

	factory := NewOSFactory()
	port, err := factory.Open(tmpPath)
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	defer port.Close()

	if port.Device() != tmpPath {
		t.Fatalf("unexpected device: %q", port.Device())
	}

	written, err := port.Write([]byte("abc"))
	if err != nil {
		t.Fatalf("Write returned error: %v", err)
	}

	if written != 3 {
		t.Fatalf("expected 3 bytes written, got %d", written)
	}
}

func TestOSFactoryOpenPropagatesErrors(t *testing.T) {
	factory := OSFactory{
		openFile: func(string, int, os.FileMode) (*os.File, error) {
			return nil, errors.New("open failed")
		},
	}

	if _, err := factory.Open("/dev/ttyUSB0"); err == nil {
		t.Fatal("expected open error")
	}
}

type fakeFactory struct {
	open func(device string) (Port, error)
}

func (f fakeFactory) Open(device string) (Port, error) {
	return f.open(device)
}

type scriptedPort struct {
	device    string
	readSeq   []readResult
	lastWrite string
	writeFn   func([]byte) (int, error)
}

type readResult struct {
	data []byte
	err  error
}

func (p *scriptedPort) Device() string {
	return p.device
}

func (p *scriptedPort) Read(buf []byte) (int, error) {
	if len(p.readSeq) == 0 {
		return 0, io.EOF
	}

	result := p.readSeq[0]
	p.readSeq = p.readSeq[1:]
	copy(buf, result.data)
	return len(result.data), result.err
}

func (p *scriptedPort) Write(data []byte) (int, error) {
	if p.writeFn != nil {
		return p.writeFn(data)
	}
	p.lastWrite = fmt.Sprintf("%x", data)
	return len(data), nil
}

func (p *scriptedPort) Close() error {
	return nil
}
