import pandas as pd
import jpype
import jpype.imports
from jpype.types import *
import os

# ✅ Manually specify the correct Java JVM path
jvm_path = "/usr/lib/jvm/java-17-openjdk-arm64/lib/server/libjvm.so"

# ✅ Path to the MPXJ JAR file
mpxj_jar = "/home/diego/mpxj_env/lib/python3.12/site-packages/mpxj/lib/mpxj.jar"  # Update this path if needed

# ✅ Path to additional required JAR files
jar_folder = "/home/diego/mpxj_libs"
extra_jars = [
    "poi-5.2.3.jar",
    "poi-ooxml-5.2.3.jar",
    "poi-ooxml-schemas-4.1.2.jar",
    "poi-scratchpad-5.2.3.jar",
    "commons-compress-1.21.jar",
    "xmlbeans-5.1.1.jar",
    "commons-io-2.11.0.jar",
    "log4j-api-2.17.2.jar",
    "log4j-core-2.17.2.jar",
    "commons-collections4-4.4.jar"
]

# ✅ Create full classpath including MPXJ and required JARs
classpath = [mpxj_jar] + [os.path.join(jar_folder, jar) for jar in extra_jars]

# ✅ Start the JVM
if not jpype.isJVMStarted():
    jpype.startJVM(jvm_path, "-Xmx1024m", "-Xms512m", classpath=classpath)

# ✅ Import MPXJ classes
from net.sf.mpxj.reader import UniversalProjectReader

# ✅ Load the MPP file
mpp_file = "/mnt/shared/casas.mpp"  # Update path if needed

try:
    project = UniversalProjectReader().read(mpp_file)
    print("JVM started and MPP file loaded successfully.")
except Exception as e:
    print(f"Error loading MPP file: {e}")
    jpype.shutdownJVM()
    exit(1)

# ✅ Extract Task Information (Fixed Errors)
tasks = []
for task in project.getTasks():  # ✅ FIXED: Changed from getAllTasks() to getTasks()
    if task.getName():  # Skip empty tasks
        tasks.append({
            "Task ID": task.getUniqueID(),
            "Parent Task ID": task.getParentTask().getUniqueID() if task.getParentTask() else None,
            "Task Name": task.getName(),
            "Start Date": task.getStart(),
            "Finish Date": task.getFinish(),
            "Duration": str(task.getDuration()),  # Convert duration to string format
            "Percentage Complete": task.getPercentageComplete(),
            "Is Milestone": "Yes" if task.getMilestone() else "No",
            "Total Slack (Holgura)": task.getTotalSlack().toString() if task.getTotalSlack() else "0",
            "Predecessor Task IDs": ", ".join([str(pred.getUniqueID()) for pred in task.getPredecessors()]) if task.getPredecessors() else "None"  # ✅ FIXED: Changed getTaskUniqueID() to getUniqueID()
        })

# ✅ Convert to DataFrame
df = pd.DataFrame(tasks)

# ✅ Save to CSV
output_csv = "/mnt/shared/project_tasks.csv"  # ✅ Save to shared folder
df.to_csv(output_csv, index=False)

print(f"✅ CSV file has been created successfully at {output_csv}")

# ✅ Shutdown JVM properly
jpype.shutdownJVM()
