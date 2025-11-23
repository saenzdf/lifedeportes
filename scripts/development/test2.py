import jpype

# Path to MPXJ JAR file
mpxj_jar = "/home/diego/mpxj_env/lib/python3.12/site-packages/mpxj/lib/mpxj.jar" 

# Start JVM
if not jpype.isJVMStarted():
    jpype.startJVM(classpath=[mpxj_jar])

# Print Java Classpath
import java.lang
print("Java Classpath:", java.lang.System.getProperty("java.class.path"))
