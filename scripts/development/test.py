import jpype
import jpype.imports
from jpype.types import *

# ✅ Manually specify the Java JVM path
jvm_path = "/usr/lib/jvm/java-17-openjdk-arm64/lib/server/libjvm.so"

# ✅ Ensure JVM starts correctly
if not jpype.isJVMStarted():
    jpype.startJVM(jvm_path, "-Xmx1024m", "-Xms512m")

# ✅ Test Java
import java.lang
print("Java Version:", java.lang.System.getProperty("java.version"))
