package identity

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func LoadOrCreate(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("instance id path is required")
	}

	if data, err := os.ReadFile(path); err == nil {
		value := strings.TrimSpace(string(data))
		if value == "" {
			return "", fmt.Errorf("instance id file %s is empty", path)
		}
		return value, nil
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("read instance id file %s: %w", path, err)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create instance id directory for %s: %w", path, err)
	}

	value, err := newUUID()
	if err != nil {
		return "", err
	}

	tempFile, err := os.CreateTemp(filepath.Dir(path), "instance-id-*")
	if err != nil {
		return "", fmt.Errorf("create temp instance id file for %s: %w", path, err)
	}

	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	if _, err := tempFile.WriteString(value + "\n"); err != nil {
		tempFile.Close()
		return "", fmt.Errorf("write temp instance id file for %s: %w", path, err)
	}

	if err := tempFile.Chmod(0o600); err != nil {
		tempFile.Close()
		return "", fmt.Errorf("chmod temp instance id file for %s: %w", path, err)
	}

	if err := tempFile.Close(); err != nil {
		return "", fmt.Errorf("close temp instance id file for %s: %w", path, err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		return "", fmt.Errorf("persist instance id file %s: %w", path, err)
	}

	return value, nil
}

func newUUID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate instance id: %w", err)
	}

	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80

	return fmt.Sprintf(
		"%08x-%04x-%04x-%04x-%012x",
		raw[0:4],
		raw[4:6],
		raw[6:8],
		raw[8:10],
		raw[10:16],
	), nil
}
