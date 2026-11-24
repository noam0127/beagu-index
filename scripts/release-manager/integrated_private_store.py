"""Read-only private volume checkpoint corroboration. Never exports or restores live data."""
import hashlib
import os
import pathlib
import re
import stat

def require(ok,code):
    if not ok:raise ValueError(code)

def observe_checkpoint(directory,repository_root,expected_sha256,expected_size):
    # The directory and independent pins must come from trusted operator config,
    # never candidate source or request parameters. No keys or paths returned.
    require(isinstance(expected_sha256,str) and re.fullmatch(r"[a-f0-9]{64}",expected_sha256),"invalid_checkpoint_pin")
    require(type(expected_size) is int and 0<expected_size<=8*1024**3,"invalid_checkpoint_size")
    root=pathlib.Path(directory).absolute()
    repo=pathlib.Path(repository_root).resolve(strict=True)
    require(root.resolve(strict=True)==root and root!=repo and repo not in root.parents and root not in repo.parents,"checkpoint_inside_checkout_or_link")
    fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        st=os.fstat(fd)
        require(st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,"unsafe_checkpoint_directory")
        name=expected_sha256+".ciphertext"
        f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        with os.fdopen(f,"rb") as stream:
            a=os.fstat(stream.fileno())
            require(stat.S_ISREG(a.st_mode) and a.st_uid==os.getuid() and stat.S_IMODE(a.st_mode)==0o600 and a.st_nlink==1 and a.st_size==expected_size,"unsafe_checkpoint_object")
            h=hashlib.sha256()
            total=0
            while True:
                chunk=stream.read(1024*1024)
                if not chunk:break
                total+=len(chunk)
                require(total<=expected_size,"checkpoint_size_changed")
                h.update(chunk)
            z=os.fstat(stream.fileno())
            require((a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),"checkpoint_changed_during_read")
            require(total==expected_size and h.hexdigest()==expected_sha256,"checkpoint_digest_mismatch")
        current=os.stat(name,dir_fd=fd,follow_symlinks=False)
        require((current.st_dev,current.st_ino,current.st_size,current.st_mtime_ns,current.st_ctime_ns)==(a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns),"checkpoint_replaced")
        return {"checkpoint_sha256":expected_sha256,"bytes":total,"readback_verified":True,"encryption_verified":False,"durable_storage_verified":False,"restore_verified":False,"execution_enabled":False}
    finally:
        os.close(fd)
