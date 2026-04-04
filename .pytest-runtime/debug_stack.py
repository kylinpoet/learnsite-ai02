import faulthandler
stack_file = open('.pytest-runtime/debug_stack.txt', 'wb', buffering=0)
faulthandler.dump_traceback_later(5, file=stack_file, repeat=True)
import app.models
