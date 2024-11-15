import { store as toolCallStore } from "../stores/toolCallStore";

async function sendToolPrompt(prompt: string, expected_tool_calls: string[], model: ModelAlias): Promise<ToolCallResponse> {
    const response = await fetch('/tool-prompt', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt,
            expected_tool_calls,
            model,
        }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

export async function runToolCall() {
    if (toolCallStore.isLoading) return;

    console.log("Running tool call");

    toolCallStore.isLoading = true;
    toolCallStore.promptResponses = [];
    toolCallStore.total_executions += 1;

    toolCallStore.rowData.forEach(async (row: ToolCallRowData) => {
        const rowIndex = toolCallStore.rowData.findIndex((r) => r.model === row.model);
        if (rowIndex === -1) return;

        // Set status to loading
        toolCallStore.rowData[rowIndex].status = 'loading';
        toolCallStore.rowData[rowIndex].toolCalls = null;
        toolCallStore.rowData[rowIndex].execution_time = null;

        try {
            console.log(`Running tool call for '${row.model}'`);
            const response = await sendToolPrompt(toolCallStore.userInput, toolCallStore.expectedToolCalls, row.model);

            // Update row with results
            const updatedRow = { ...toolCallStore.rowData[rowIndex] };
            updatedRow.toolCalls = response.tool_calls;
            updatedRow.execution_time = response.runTimeMs;
            updatedRow.execution_cost = response.inputAndOutputCost;
            updatedRow.total_cost = Number(((updatedRow.total_cost || 0) + response.inputAndOutputCost).toFixed(6));
            updatedRow.total_execution_time = (updatedRow.total_execution_time || 0) + response.runTimeMs;
            updatedRow.status = 'success';
            toolCallStore.promptResponses.push(response);

            console.log(`Success: '${row.model}':`, response.tool_calls);
            toolCallStore.rowData.splice(rowIndex, 1, updatedRow);

            // After all rows complete, calculate relative percentages
            const allComplete = toolCallStore.rowData.every(row =>
                row.status === 'success' || row.status === 'error'
            );

            if (allComplete) {
                const lowestCost = Math.min(...toolCallStore.rowData
                    .filter(row => row.total_cost > 0)
                    .map(row => row.total_cost));

                toolCallStore.rowData.forEach((row, idx) => {
                    const updatedRow = { ...row };
                    updatedRow.relativePricePercent = row.total_cost > 0
                        ? Math.round((row.total_cost / lowestCost) * 100)
                        : 0;
                    toolCallStore.rowData.splice(idx, 1, updatedRow);
                });
            }
        } catch (error) {
            console.error(`Error processing model '${row.model}':`, error);
            const updatedRow = { ...toolCallStore.rowData[rowIndex] };
            updatedRow.toolCalls = null;
            updatedRow.execution_time = 0;
            updatedRow.status = 'error';
            toolCallStore.rowData.splice(rowIndex, 1, updatedRow);
        }
    });

    toolCallStore.isLoading = false;
}
