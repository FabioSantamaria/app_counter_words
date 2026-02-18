const form = document.getElementById("analyzeForm")
const statusEl = document.getElementById("status")

const summaryIds = ["totalWords", "uniqueWords", "lexicalDiversity", "totalSentences"]
const summaryEls = Object.fromEntries(summaryIds.map((id) => [id, document.getElementById(id)]))

const phraseList = document.getElementById("phraseList")
const starterList = document.getElementById("starterList")
const longSentences = document.getElementById("longSentences")
const similarSentences = document.getElementById("similarSentences")
const focusCounts = document.getElementById("focusCounts")
const wordCloudContainer = document.getElementById("wordCloud")

const submitButton = form.querySelector('button[type="submit"]')
const exportJsonButton = document.getElementById("exportJson")
const exportCsvButton = document.getElementById("exportCsv")

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

function renderFrequencyList(container, items, emptyMessage, isPhrase = false) {
  clearList(container)
  if (!items.length) {
    const empty = document.createElement("div")
    empty.className = "empty"
    empty.textContent = emptyMessage
    container.appendChild(empty)
    return
  }

  const maxCount = Math.max(...items.map((i) => i.count)) || 1

  items.forEach((item) => {
    const row = document.createElement("div")
    row.className = "freq-row"
    
    const label = isPhrase ? `${item.value} (${item.n}-gram)` : item.value
    const percentage = (item.count / maxCount) * 100

    row.innerHTML = `
      <div class="freq-bar-container">
        <div class="freq-bar" style="width: ${percentage}%"></div>
        <span class="freq-text" title="${label}">${label}</span>
      </div>
      <span class="freq-count">${item.count}</span>
    `
    container.appendChild(row)
  })
}

function renderSimilarSentences(container, items, emptyMessage) {
  clearList(container)
  if (!items.length) {
    const empty = document.createElement("div")
    empty.className = "empty"
    empty.textContent = emptyMessage
    container.appendChild(empty)
    return
  }
  items.forEach((item) => {
    const card = document.createElement("div")
    card.className = "similarity-card"
    
    const percentage = Math.round(item.score * 100)
    
    card.innerHTML = `
      <div class="similarity-header">
        <span>Similarity Match</span>
        <span class="similarity-score">${percentage}%</span>
      </div>
      <div class="similarity-text">A: ${item.sentenceA}</div>
      <div class="similarity-text">B: ${item.sentenceB}</div>
    `
    container.appendChild(card)
  })
}

function renderLongSentences(container, items, emptyMessage) {
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
    row.className = "list-item warning"
    row.innerHTML = `
      <span>${item.sentence}</span>
      <span class="pill">${item.words} words</span>
    `
    container.appendChild(row)
  })
}

function updateSummary(totals) {
  summaryEls.totalWords.textContent = totals.totalWords
  summaryEls.uniqueWords.textContent = totals.uniqueWords
  summaryEls.lexicalDiversity.textContent = totals.lexicalDiversity
  summaryEls.totalSentences.textContent = totals.totalSentences
}

function renderWordCloud(items) {
  wordCloudContainer.innerHTML = ""
  if (!items.length) {
    wordCloudContainer.innerHTML = '<div class="empty" style="padding: 20px; text-align: center;">No words to display.</div>'
    return
  }
  
  // Scale factor based on canvas size
  const maxCount = Math.max(...items.map(i => i.count))
  const list = items.map(item => [item.value, 15 + ((item.count / maxCount) * 60)])

  WordCloud(wordCloudContainer, { 
    list: list,
    gridSize: 8,
    weightFactor: 1,
    fontFamily: 'Inter, system-ui, sans-serif',
    color: (word, weight, fontSize) => {
      const colors = ['#4f46e5', '#6366f1', '#818cf8', '#3730a3']
      return colors[Math.floor(Math.random() * colors.length)]
    },
    rotateRatio: 0,
    backgroundColor: '#fafafa'
  })
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
    
    // Render Visualizations
    renderWordCloud(payload.repeatedWords)
    renderFrequencyList(phraseList, payload.repeatedPhrases, "No repeated phrases found.", true)
    renderKeyValueList(starterList, payload.repeatedStarters, "No repeated starters found.")
    renderLongSentences(longSentences, payload.longSentences, "No long sentences flagged.")
    renderSimilarSentences(similarSentences, payload.similarSentences, "No similar sentences found.")
    renderKeyValueList(focusCounts, payload.customCounts, "No focus words provided.")

    setExportState(true)
    setStatus("Analysis complete.", "success")
  } catch (error) {
    console.error(error)
    setStatus("Failed to analyze text.", "error")
  } finally {
    submitButton.disabled = false
  }
})
