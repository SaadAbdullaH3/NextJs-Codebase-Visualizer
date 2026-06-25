import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { messages, selectedContext } = await req.json();

    // 3. Read the generated repository layout map straight from local workspace
    let graphData = null;
    try {
      const filePath = path.join(process.cwd(), "commerce.json");
      const fileContent = await fs.readFile(filePath, "utf-8");
      graphData = JSON.parse(fileContent);
    } catch (e) {
      try {
         // Fallback to public/commerce2.json if commerce.json is missing
         const fallbackPath = path.join(process.cwd(), "public", "commerce2.json");
         const fileContent = await fs.readFile(fallbackPath, "utf-8");
         graphData = JSON.parse(fileContent);
      } catch(err) {
         graphData = { error: "Local workspace graph JSON not found." };
      }
    }

    const systemPrompt = `You are NextVis AI, an expert software architect. Use the provided graph.json structural mapping data to answer user questions about file components, routes, serveractions, and dependency tracks. Keep explanations plain, clear, and scannable for non-technical users.\n\n--- WORKSPACE MAP DATA ---\n${JSON.stringify(graphData)}`;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite", 
      systemInstruction: systemPrompt 
    });

    let finalMessage = messages[messages.length - 1].content;
    
    // 4. Prepend context tags onto every chat turn pass
    if (selectedContext) {
      finalMessage = `[ACTIVE HIGHLIGHT CONTEXT: ${selectedContext}]\n\n${finalMessage}`;
    }

    const formattedHistory = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: formattedHistory,
    });

    const result = await chat.sendMessage(finalMessage);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // 5. If a rate limit error occurs, catch it gracefully and send back a user-friendly system alert.
    if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota")) {
      return NextResponse.json(
        { reply: "System Alert: The free Gemini API rate limit has been reached. Please wait a moment before asking another question." }
      );
    }
    return NextResponse.json(
      { reply: "System Alert: Failed to communicate with the Gemini API. Please ensure your GEMINI_API_KEY is configured in .env.local" }
    );
  }
}
