const form = document.getElementById("analyzeForm")
const statusEl = document.getElementById("status")

const summaryIds = ["totalWords", "uniqueWords", "lexicalDiversity", "totalSentences"]
const summaryEls = Object.fromEntries(summaryIds.map((id) => [id, document.getElementById(id)]))

const starterList = document.getElementById("starterList")
const longSentences = document.getElementById("longSentences")
const similarSentences = document.getElementById("similarSentences")
const focusCounts = document.getElementById("focusCounts")

const wordChartCtx = document.getElementById("wordChart")
const phraseChartCtx = document.getElementById("phraseChart")
const submitButton = form.querySelector('button[type="submit"]')
const exportJsonButton = document.getElementById("exportJson")
const exportCsvButton = document.getElementById("exportCsv")

let wordChart
let phraseChart
let latestAnalysis = null

function setStatus(message, kind = "info") {
  statusEl.textContent = message
  statusEl.dataset.kind = kind
}

function clearList(container) {
  container.innerHTML = ""
}

function renderList(container, items, emptyMessage) {
  clearList(container)
  if (!items.length) {
    const empty = document.createElement("div")
    empty.className = "empty"
    empty.textContent = emptyMessage
    container.appendChild(empty)
    return
  }
  items.forEach((item) => {
    const row = document.createElement("div")
    row.className = "list-item"
    row.textContent = item
    container.appendChild(row)
  })
}

function renderKeyValueList(container, items, emptyMessage) {
  clearList(container)
  if (!items.length) {
    const empty = document.createElement("div")
    empty.className = "empty"
    empty.textContent = emptyMessage
    container.appendChild(empty)
    return
  }
  items.forEach((item) => {
    const row = document.createElement("div")
    row.className = "list-item"
    row.innerHTML = `<span>${item.value}</span><span class="pill">${item.count}</span>`
    container.appendChild(row)
  })
}

function updateChart(chartRef, ctx, labels, data, label) {
  if (chartRef) {
    chartRef.destroy()
  }
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          backgroundColor: "#5b7cfa"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  })
}

function updateSummary(totals) {
  summaryEls.totalWords.textContent = totals.totalWords
  summaryEls.uniqueWords.textContent = totals.uniqueWords
  summaryEls.lexicalDiversity.textContent = totals.lexicalDiversity
  summaryEls.totalSentences.textContent = totals.totalSentences
}

function buildPhraseLabel(item) {
  return `${item.value} (${item.n}-gram)`
}

function csvEscape(value) {
  const text = String(value ?? "")
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function buildCsv(payload) {
  const lines = []
  lines.push(["section", "metric", "value"].join(","))
  Object.entries(payload.totals).forEach(([key, value]) => {
    lines.push([csvEscape("totals"), csvEscape(key), csvEscape(value)].join(","))
  })
  payload.repeatedWords.forEach((item) => {
    lines.push([csvEscape("repeatedWords"), csvEscape(item.value), csvEscape(item.count)].join(","))
  })
  payload.repeatedPhrases.forEach((item) => {
    lines.push([csvEscape("repeatedPhrases"), csvEscape(buildPhraseLabel(item)), csvEscape(item.count)].join(","))
  })
  payload.repeatedStarters.forEach((item) => {
    lines.push([csvEscape("repeatedStarters"), csvEscape(item.value), csvEscape(item.count)].join(","))
  })
  payload.longSentences.forEach((item) => {
    lines.push([csvEscape("longSentences"), csvEscape(item.sentence), csvEscape(item.words)].join(","))
  })
  payload.similarSentences.forEach((item) => {
    lines.push([csvEscape("similarSentences"), csvEscape(item.sentenceA), csvEscape(item.sentenceB)].join(","))
    lines.push([csvEscape("similarSentencesScore"), csvEscape(item.sentenceA), csvEscape(item.score)].join(","))
  })
  payload.customCounts.forEach((item) => {
    lines.push([csvEscape("focusCounts"), csvEscape(item.value), csvEscape(item.count)].join(","))
  })
  return lines.join("\n")
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function setExportState(enabled) {
  exportJsonButton.disabled = !enabled
  exportCsvButton.disabled = !enabled
}

function buildFilename(suffix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `analysis-${stamp}.${suffix}`
}

exportJsonButton.addEventListener("click", () => {
  if (!latestAnalysis) return
  downloadFile(buildFilename("json"), JSON.stringify(latestAnalysis, null, 2), "application/json")
})

exportCsvButton.addEventListener("click", () => {
  if (!latestAnalysis) return
  downloadFile(buildFilename("csv"), buildCsv(latestAnalysis), "text/csv")
})

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  setStatus("Analyzing text...", "info")
  submitButton.disabled = true
  setExportState(false)

  const formData = new FormData(form)
  form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    formData.set(checkbox.name, checkbox.checked ? "true" : "false")
  })

  if (!formData.get("file")?.name && !formData.get("text")) {
    setStatus("Please upload a document or paste text.", "error")
    submitButton.disabled = false
    return
  }

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    })
    const payload = await response.json()
    if (!response.ok) {
      setStatus(payload.error || "Failed to analyze text.", "error")
      submitButton.disabled = false
      return
    }

    updateSummary(payload.totals)
    latestAnalysis = payload
    const wordLabels = payload.repeatedWords.map((item) => item.value)
    const wordCounts = payload.repeatedWords.map((item) => item.count)
    wordChart = updateChart(wordChart, wordChartCtx, wordLabels, wordCounts, "Repeated words")

    const phraseLabels = payload.repeatedPhrases.map(buildPhraseLabel)
    const phraseCounts = payload.repeatedPhrases.map((item) => item.count)
    phraseChart = updateChart(phraseChart, phraseChartCtx, phraseLabels, phraseCounts, "Repeated phrases")

    renderKeyValueList(starterList, payload.repeatedStarters, "No repeated starters found.")
    renderList(longSentences, payload.longSentences.map((item) => item.sentence), "No long sentences flagged.")
    renderList(
      similarSentences,
      payload.similarSentences.map(
        (item) => `${item.score} · ${item.sentenceA} / ${item.sentenceB}`
      ),
      "No similar sentences found."
    )
    renderKeyValueList(focusCounts, payload.customCounts, "No focus words provided.")

    setExportState(true)
    setStatus("Analysis complete.", "success")
  } catch (error) {
    setStatus("Failed to analyze text.", "error")
  } finally {
    submitButton.disabled = false
  }
})
