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

let wordChart
let phraseChart

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

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  setStatus("Analyzing text...", "info")
  submitButton.disabled = true

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

    setStatus("Analysis complete.", "success")
  } catch (error) {
    setStatus("Failed to analyze text.", "error")
  } finally {
    submitButton.disabled = false
  }
})
