package identity

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestLoadOrCreatePersistsGeneratedID(t *testing.T) {
	path := filepath.Join(t.TempDir(), "instance-id")

	first, err := LoadOrCreate(path)
	if err != nil {
		t.Fatalf("LoadOrCreate returned error: %v", err)
	}

	second, err := LoadOrCreate(path)
	if err != nil {
		t.Fatalf("LoadOrCreate returned error on reread: %v", err)
	}

	if first != second {
		t.Fatalf("expected durable identity to persist, got %q and %q", first, second)
	}

	if matched := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(first); !matched {
		t.Fatalf("expected RFC4122-style uuid, got %q", first)
	}
}

func TestLoadOrCreateRejectsEmptyExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "instance-id")
	if err := os.WriteFile(path, []byte("\n"), 0o600); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	if _, err := LoadOrCreate(path); err == nil {
		t.Fatal("expected empty instance id file to fail")
	}
}
