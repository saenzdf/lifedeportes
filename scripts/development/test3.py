import jpype
import jpype.imports
from jpype.types import *

# ✅ Get the correct Java path
jvm_path = jpype.getDefaultJVMPath()

# ✅ Ensure JVM starts correctly
if not jpype.isJVMStarted():
    jpype.startJVM(jvm_path, "-Xmx1024m", "-Xms512m")

# ✅ Verify if Java is accessible
import java.lang
print("Java Version:", java.lang.System.getProperty("java.version"))
