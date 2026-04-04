from pathlib import Path
trace = Path('.pytest-runtime/debug_trace.txt')
trace.write_text('step0\n', encoding='utf-8')
import app.db.init_db
trace.write_text(trace.read_text(encoding='utf-8') + 'step1\n', encoding='utf-8')
