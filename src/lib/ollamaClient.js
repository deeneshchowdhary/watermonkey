export async function generateAiSummary(wasteItems) {
  const totalWaste = wasteItems.reduce((acc, item) => acc + item.monthlyLoss, 0);

  const prompt = `
You are Water Monkey AI, an expert FinOps advisor.
Analyze these wasted cloud resources detected on the user's local machine:
${JSON.stringify(wasteItems, null, 2)}

Total Monthly Waste: $${totalWaste.toFixed(2)}

Provide a concise, 3-bullet-point executive summary for a CTO/founder explaining:
1. What the immediate biggest cost leak is.
2. The risk of terminating these resources (e.g., is it safe?).
3. One recommended action step.
  `;

  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:1b",
        prompt: prompt,
        stream: false,
      }),
    });

    if (!res.ok) throw new Error("Ollama connection failed.");
    const data = await res.json();
    return data.response;
  } catch (err) {
    return "💡 Local Ollama AI unavailable. Start Ollama locally on port 11434 to get real-time AI executive insights.";
  }
}
