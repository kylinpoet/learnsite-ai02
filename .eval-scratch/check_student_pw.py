import sqlite3, hashlib, hmac

conn = sqlite3.connect('learnsite.db')
cur = conn.cursor()
cur.execute("SELECT username, password_hash FROM users WHERE username = '240101'")
row = cur.fetchone()
print('user:', row[0] if row else None)
if not row:
    raise SystemExit
h = row[1]
print('hash prefix:', h[:40])

candidates = ['12345', '222221', '123456', '111111', '12345678', 'admin']
if ':' in h:
    salt_hex, digest_hex = h.split(':', maxsplit=1)
    for c in candidates:
        digest = hashlib.pbkdf2_hmac('sha256', c.encode('utf-8'), bytes.fromhex(salt_hex), 120_000)
        if hmac.compare_digest(digest.hex(), digest_hex):
            print('MATCH:', c)
else:
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=['pbkdf2_sha256'], pbkdf2_sha256__rounds=120_000)
    for c in candidates:
        try:
            if ctx.verify(c, h):
                print('MATCH:', c)
        except Exception as exc:
            print('verify error:', exc)
