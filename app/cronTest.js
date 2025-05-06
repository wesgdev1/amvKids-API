// Schedule the task to run at 8 PM every day
const runCronJob = async () => {
  try {
    console.log("hola desde a la hora", new Date().toLocaleString());

    console.log("Cron job executed successfully:", result);
  } catch (error) {
    console.error("Error executing cron job:", error);
  }
};

runCronJob();
