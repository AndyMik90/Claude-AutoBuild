import pytest


def test_acquire_lock_closes_fd_on_filelockerror(tmp_path, monkeypatch):
    """
    Regression test: if lock acquisition raises FileLockError, the opened file
    descriptor must be closed to avoid leaks.
    """
    import file_lock

    target = tmp_path / "data.json"
    lock = file_lock.FileLock(target, timeout=0.01, exclusive=True)

    closed_fds: list[int] = []
    original_close = file_lock.os.close

    def tracking_close(fd: int) -> None:
        closed_fds.append(fd)
        original_close(fd)

    def boom(_fd: int, _exclusive: bool) -> None:
        raise file_lock.FileLockError("simulated failure")

    monkeypatch.setattr(file_lock.os, "close", tracking_close)
    monkeypatch.setattr(file_lock, "_try_lock", boom)

    with pytest.raises(file_lock.FileLockError):
        lock._acquire_lock()

    assert lock._fd is None
    assert len(closed_fds) == 1


