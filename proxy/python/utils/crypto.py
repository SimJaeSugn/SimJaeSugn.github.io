import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from utils.keystore import load_or_create_key

_KEY: bytes = load_or_create_key()
_LEGACY_KEY = b"uxermanager-local-secret-key-32b"


def encrypt(text: str) -> str:
    iv = os.urandom(12)
    aesgcm = AESGCM(_KEY)
    ct_with_tag = aesgcm.encrypt(iv, text.encode("utf-8"), None)
    # AESGCM.encrypt returns ciphertext + 16-byte tag appended
    ct = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]
    return json.dumps({
        "iv": iv.hex(),
        "tag": tag.hex(),
        "data": ct.hex(),
    })


def decrypt(encrypted_json: str) -> str:
    obj = json.loads(encrypted_json)
    iv = bytes.fromhex(obj["iv"])
    tag = bytes.fromhex(obj["tag"])
    ct = bytes.fromhex(obj["data"])
    aesgcm = AESGCM(_KEY)
    plaintext = aesgcm.decrypt(iv, ct + tag, None)
    return plaintext.decode("utf-8")


def decrypt_legacy(encrypted_json: str) -> str:
    obj = json.loads(encrypted_json)
    iv = bytes.fromhex(obj["iv"])
    tag = bytes.fromhex(obj["tag"])
    ct = bytes.fromhex(obj["data"])
    aesgcm = AESGCM(_LEGACY_KEY)
    plaintext = aesgcm.decrypt(iv, ct + tag, None)
    return plaintext.decode("utf-8")
