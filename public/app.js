// DOM Elements
const viewInput = document.getElementById("view-input")
const viewResults = document.getElementById("view-results")
const form = document.getElementById("analyzeForm")
const fileInput = document.getElementById("file")
const textInput = document.getElementById("textInput")
const loadSampleButton = document.getElementById("loadSample")
const backToInputButton = document.getElementById("backToInput")
const statusEl = document.getElementById("status")

// Results Elements
const statWords = document.getElementById("stat-words")
const statUnique = document.getElementById("stat-unique")
const statSentences = document.getElementById("stat-sentences")
const statDiversity = document.getElementById("stat-diversity")

const tableWords = document.querySelector("#table-words tbody")
const tablePhrases = document.querySelector("#table-phrases tbody")
const tableStarters = document.querySelector("#table-starters tbody")
const tableSentences = document.querySelector("#table-sentences tbody")
const similarList = document.getElementById("similar-list")
const overviewWordsList = document.getElementById("overview-words-list")
const overviewLongList = document.getElementById("overview-long-list")

const exportJsonButton = document.getElementById("exportJson")
const exportCsvButton = document.getElementById("exportCsv")

// Navigation Tabs
const navItems = document.querySelectorAll(".nav-item")
const tabContents = document.querySelectorAll(".tab-content")

let currentAnalysisData = null

// --- Navigation Logic ---

function switchView(viewName) {
  if (viewName === "results") {
    viewInput.classList.remove("active")
    viewResults.classList.add("active")
  } else {
    viewResults.classList.remove("active")
    viewInput.classList.add("active")
  }
}

navItems.forEach(item => {
  item.addEventListener("click", () => {
    // Remove active class from all
    navItems.forEach(n => n.classList.remove("active"))
    tabContents.forEach(t => t.classList.remove("active"))

    // Add active to clicked
    item.classList.add("active")
    const targetId = item.dataset.target
    document.getElementById(targetId).classList.add("active")
  })
})

backToInputButton.addEventListener("click", () => {
  switchView("input")
})

// --- Data Rendering ---

function renderTable(tbody, data, maxCount) {
  tbody.innerHTML = ""
  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='3'>No repetitions found.</td></tr>"
    return
  }

  data.forEach(item => {
    const row = document.createElement("tr")
    const percentage = (item.count / maxCount) * 100
    
    // Check if item has 'n' (phrase length) or just value/count
    let html = `<td>${item.value || item.sentence || item.starter}</td>`
    
    if (item.n) {
      html += `<td>${item.n}-gram</td>`
    } else if (tbody.id === "table-words" || tbody.id === "table-starters") {
       // Starters and words don't need a specific "length" column in this design, 
       // but table-words header has 3 cols (Word, Count, Freq). 
       // table-starters header has 3 cols (Starter, Count, Freq).
       // table-phrases header has 4 cols (Phrase, Length, Count, Freq).
    } else if (tbody.id === "table-sentences") {
        // Sentences table only has Sentence and Count
        html += `<td>${item.count}</td>`
        row.innerHTML = html
        tbody.appendChild(row)
        return // Skip frequency bar for sentences table as per HTML structure (2 cols)
    }

    html += `<td>${item.count}</td>`
    
    // Add Frequency Bar
    html += `
      <td>
        <div class="freq-bar-bg">
          <div class="freq-bar-fill" style="width: ${percentage}%"></div>
        </div>
      </td>
    `
    row.innerHTML = html
    tbody.appendChild(row)
  })
}

function renderSimilarSentences(data) {
  similarList.innerHTML = ""
  if (!data || data.length === 0) {
    similarList.innerHTML = "<p class='subtitle'>No similar sentences found.</p>"
    return
  }

  data.forEach(item => {
    const card = document.createElement("div")
    card.className = "sim-card"
    card.innerHTML = `
      <div class="sim-score">${Math.round(item.score * 100)}% Similarity</div>
      <div class="sim-group">
        <div class="sim-text"><span class="sim-label">A</span> ${item.sentenceA}</div>
        <div class="sim-text"><span class="sim-label">B</span> ${item.sentenceB}</div>
      </div>
    `
    similarList.appendChild(card)
  })
}

function renderOverview(data) {
  statWords.textContent = data.totals.totalWords
  statUnique.textContent = data.totals.uniqueWords
  statSentences.textContent = data.totals.totalSentences
  statDiversity.textContent = data.totals.lexicalDiversity

  // Mini lists
  overviewWordsList.innerHTML = ""
  data.repeatedWords.slice(0, 5).forEach(w => {
    overviewWordsList.innerHTML += `<div><span>${w.value}</span> <strong>${w.count}</strong></div>`
  })

  overviewLongList.innerHTML = ""
  data.longSentences.slice(0, 5).forEach(s => {
    overviewLongList.innerHTML += `<div><span>${s.sentence.substring(0, 40)}...</span> <strong>${s.words} words</strong></div>`
  })
}

function updateResults(data) {
  currentAnalysisData = data
  renderOverview(data)

  // Determine max counts for bars
  const maxWord = data.repeatedWords.length ? data.repeatedWords[0].count : 1
  const maxPhrase = data.repeatedPhrases.length ? data.repeatedPhrases[0].count : 1
  const maxStarter = data.repeatedStarters.length ? data.repeatedStarters[0].count : 1
  
  renderTable(tableWords, data.repeatedWords, maxWord)
  renderTable(tablePhrases, data.repeatedPhrases, maxPhrase)
  renderTable(tableStarters, data.repeatedStarters, maxStarter)
  renderTable(tableSentences, data.repeatedSentences, 1) // No bar for sentences
  
  renderSimilarSentences(data.similarSentences)

  switchView("results")
}

// --- Form Handling ---

form.addEventListener("submit", async (e) => {
  e.preventDefault()
  
  const formData = new FormData(form)
  
  // Explicitly handle the boolean toggle for excludeCommon
  // If unchecked, FormData sends nothing, so we must manually append 'false'
  const excludeCommonEl = form.querySelector('[name="excludeCommon"]')
  if (excludeCommonEl) formData.set('excludeCommon', excludeCommonEl.checked)

  // Ensure all analysis features are enabled by default (since UI checkboxes were removed)
  formData.set('repeatedWords', 'true')
  formData.set('repeatedPhrases', 'true')
  formData.set('repeatedStarters', 'true')
  formData.set('repeatedSentences', 'true')
  formData.set('similarSentences', 'true')
  
  // Handle file or text
  const file = fileInput.files[0]
  const text = textInput.value.trim()

  if (!file && !text) {
    statusEl.textContent = "Please provide text or upload a file."
    statusEl.style.color = "red"
    return
  }

  statusEl.textContent = "Analyzing..."
  statusEl.style.color = "var(--primary)"

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    })

    if (!response.ok) throw new Error("Analysis failed")

    const data = await response.json()
    updateResults(data)
    statusEl.textContent = ""
    
  } catch (err) {
    console.error(err)
    statusEl.textContent = "Error occurred during analysis."
    statusEl.style.color = "red"
  }
})

// --- Sample Text ---

loadSampleButton.addEventListener("click", () => {
  const sampleText = `The importance of writing clear text cannot be overstated. The importance of writing clear text is huge. Writing clear text is very important for communication.

Basically, we want to avoid repetition. Basically, repetition is bad. In other words, we should vary our vocabulary. In other words, use different words.

This is an example of a very long sentence that wanders around the point without ever really getting to it, adding clause after clause of unnecessary detail and filler words that serve no purpose other than to inflate the word count and confuse the reader, which is exactly what we are trying to avoid in good writing.

However, sometimes we make mistakes. However, we can correct them. Therefore, we use tools. Therefore, we use analyzers.

The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the active dog.`

  textInput.value = sampleText
  statusEl.textContent = "Sample text loaded."
  statusEl.style.color = "green"
})

// --- Exports ---

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

exportJsonButton.addEventListener("click", () => {
  if (!currentAnalysisData) return
  downloadFile("analysis.json", JSON.stringify(currentAnalysisData, null, 2), "application/json")
})

exportCsvButton.addEventListener("click", () => {
  if (!currentAnalysisData) return
  
  // Flatten simple lists for CSV
  let csv = "Category,Item,Count/Score\n"
  
  currentAnalysisData.repeatedWords.forEach(w => csv += `Repeated Word,"${w.value}",${w.count}\n`)
  currentAnalysisData.repeatedPhrases.forEach(p => csv += `Repeated Phrase,"${p.value}",${p.count}\n`)
  currentAnalysisData.repeatedStarters.forEach(s => csv += `Repeated Starter,"${s.value || s.starter}",${s.count}\n`)
  currentAnalysisData.repeatedSentences.forEach(s => csv += `Repeated Sentence,"${s.value || s.sentence}",${s.count}\n`)
  currentAnalysisData.similarSentences.forEach(s => csv += `Similar Pair,"${s.sentenceA} <-> ${s.sentenceB}",${s.score}\n`)
  
  downloadFile("analysis.csv", csv, "text/csv")
})
