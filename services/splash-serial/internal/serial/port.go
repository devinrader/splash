package serial

import (
	"fmt"
	"io"
	"os"
)

type ConnectionState string

const (
	StateConnecting   ConnectionState = "connecting"
	StateConnected    ConnectionState = "connected"
	StateDisconnected ConnectionState = "disconnected"
	StateError        ConnectionState = "error"
	StateWriteBlocked ConnectionState = "write_blocked"
)

type Port interface {
	io.ReadWriteCloser
	Device() string
}

type Factory interface {
	Open(device string) (Port, error)
}

type UnsupportedFactory struct{}

func NewUnsupportedFactory() UnsupportedFactory {
	return UnsupportedFactory{}
}

func (UnsupportedFactory) Open(device string) (Port, error) {
	return nil, fmt.Errorf("serial adapter factory is not implemented for %s", device)
}

type OSFactory struct {
	openFile func(name string, flag int, perm os.FileMode) (*os.File, error)
}

func NewOSFactory() OSFactory {
	return OSFactory{openFile: os.OpenFile}
}

func (f OSFactory) Open(device string) (Port, error) {
	file, err := f.openFile(device, os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}

	return &FilePort{
		device: device,
		file:   file,
	}, nil
}

type FilePort struct {
	device string
	file   *os.File
}

func (p *FilePort) Device() string {
	return p.device
}

func (p *FilePort) Read(data []byte) (int, error) {
	return p.file.Read(data)
}

func (p *FilePort) Write(data []byte) (int, error) {
	return p.file.Write(data)
}

func (p *FilePort) Close() error {
	return p.file.Close()
}

type MemoryPort struct {
	device string
}

func NewPort(device string) *MemoryPort {
	return &MemoryPort{device: device}
}

func (p *MemoryPort) Device() string {
	return p.device
}

func (p *MemoryPort) Read(_ []byte) (int, error) {
	return 0, io.EOF
}

func (p *MemoryPort) Write(data []byte) (int, error) {
	return len(data), nil
}

func (p *MemoryPort) Close() error {
	return nil
}
