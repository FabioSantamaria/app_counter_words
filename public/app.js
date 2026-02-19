const editor = document.getElementById("textDisplay")
const form = document.getElementById("analyzeForm")
const statusEl = document.getElementById("status")
const docStats = document.getElementById("docStats")

// Tab Elements
const tabBtns = document.querySelectorAll(".tab-btn")
const tabPanes = document.querySelectorAll(".tab-pane")

// Sidebar Lists
const freqList = document.getElementById("freqList")
const structureList = document.getElementById("structureList")
const uniqueWordsCount = document.getElementById("uniqueWordsCount")

// Buttons
const submitButton = form.querySelector('button[type="submit"]')
const loadSampleButton = document.getElementById("loadSample")
const exportJsonButton = document.getElementById("exportJson")
const exportCsvButton = document.getElementById("exportCsv")

let currentAnalysis = null
let isHighlighting = false

// --- Utility Functions ---

function setStatus(message, kind = "info") {
  statusEl.textContent = message
  statusEl.dataset.kind = kind
}

function updateStats(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length
  const chars = text.length
  docStats.innerHTML = `
    <span>${words} words</span>
    <span>${sentences} sentences</span>
    <span>${chars} chars</span>
  `
}

// --- Tab Switching ---

tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    // Remove active class from all
    tabBtns.forEach(b => b.classList.remove("active"))
    tabPanes.forEach(p => p.classList.remove("active"))
    
    // Add active to clicked
    btn.classList.add("active")
    const tabId = `tab-${btn.dataset.tab}`
    document.getElementById(tabId).classList.add("active")
  })
})

// --- Highlighting Logic ---

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clearHighlights() {
  if (!isHighlighting) return
  // If we are highlighting, we might have modified the HTML.
  // We should revert to plain text if possible, or just remove <mark> tags.
  // Easiest is to grab innerText and re-render, but that loses cursor.
  // Better: replace <mark> with its content.
  const marks = editor.querySelectorAll("mark")
  marks.forEach(mark => {
    const text = document.createTextNode(mark.textContent)
    mark.parentNode.replaceChild(text, mark)
  })
  editor.normalize() // Merges adjacent text nodes
  isHighlighting = false
}

function highlightText(pattern, type = "word") {
  // 1. Clear previous
  clearHighlights()
  
  if (!pattern) return

  // 2. Prepare Regex
  let regex
  if (type === "word") {
    // Match whole word, case insensitive
    regex = new RegExp(`\\b(${escapeRegex(pattern)})\\b`, 'gi')
  } else if (type === "sentence") {
    // Match the exact sentence string, allowing for some whitespace diffs
    // Normalize spaces in pattern to \s+
    const normalizedPattern = escapeRegex(pattern).replace(/\s+/g, '\\s+')
    regex = new RegExp(`(${normalizedPattern})`, 'gi')
  }

  // 3. Apply Highlighting
  // We need to traverse text nodes to avoid breaking HTML structure if any
  // But since our editor is simple text, we can do innerHTML replacement for now.
  // Ideally, use a TreeWalker.
  
  const text = editor.innerText
  const newHtml = text.replace(regex, (match) => {
    const className = type === "sentence" ? "highlight-sentence-active" : "highlight-active"
    return `<mark class="${className}">${match}</mark>`
  })
  
  editor.innerHTML = newHtml
  isHighlighting = true
  
  // 4. Scroll to first match
  const firstMark = editor.querySelector("mark")
  if (firstMark) {
    firstMark.scrollIntoView({ behavior: "smooth", block: "center" })
  }
}

// --- Rendering Sidebar Data ---

function renderFrequencyList(items) {
  freqList.innerHTML = ""
  if (!items || !items.length) {
    freqList.innerHTML = '<div class="empty">No repeated words found.</div>'
    return
  }

  const maxCount = Math.max(...items.map(i => i.count))

  items.forEach(item => {
    const row = document.createElement("div")
    row.className = "freq-row"
    const percentage = (item.count / maxCount) * 100
    
    row.innerHTML = `
      <div class="freq-bar-container">
        <div class="freq-bar" style="width: ${percentage}%"></div>
        <span class="freq-text" title="${item.value}">${item.value}</span>
      </div>
      <span class="freq-count">${item.count}</span>
    `
    
    row.addEventListener("click", () => {
      highlightText(item.value, "word")
    })
    
    freqList.appendChild(row)
  })
}

function renderStructureList(analysis) {
  structureList.innerHTML = ""
  
  const { longSentences, similarSentences, repeatedStarters } = analysis
  let hasItems = false

  // Long Sentences
  if (longSentences && longSentences.length) {
    hasItems = true
    const header = document.createElement("div")
    header.className = "structure-header"
    header.textContent = "Long Sentences"
    structureList.appendChild(header)

    longSentences.forEach(item => {
      const card = document.createElement("div")
      card.className = "structure-card"
      card.innerHTML = `
        <div class="structure-preview">${item.sentence}</div>
        <div style="margin-top:0.5rem; display:flex; justify-content:space-between; align-items:center;">
          <span class="tag-long">${item.words} words</span>
          <span style="font-size:0.75rem; color:#6b7280;">Click to find</span>
        </div>
      `
      card.addEventListener("click", () => highlightText(item.sentence, "sentence"))
      structureList.appendChild(card)
    })
  }

  // Similar Sentences
  if (similarSentences && similarSentences.length) {
    hasItems = true
    const header = document.createElement("div")
    header.className = "structure-header"
    header.textContent = "Similar Sentences"
    header.style.marginTop = "1.5rem"
    structureList.appendChild(header)

    similarSentences.forEach(item => {
      const card = document.createElement("div")
      card.className = "structure-card"
      card.innerHTML = `
        <div style="margin-bottom:0.5rem;">
          <span class="tag-similarity">${Math.round(item.score * 100)}% Match</span>
        </div>
        <div class="structure-preview" style="margin-bottom:0.25rem; border-left:2px solid #fbbf24; padding-left:0.5rem;">${item.sentenceA}</div>
        <div class="structure-preview" style="border-left:2px solid #fbbf24; padding-left:0.5rem;">${item.sentenceB}</div>
      `
      // For similar, we highlight A. Ideally we highlight both.
      // Regex allows matching A OR B.
      card.addEventListener("click", () => {
         // Create a combined regex pattern
         const pattern = `${escapeRegex(item.sentenceA)}|${escapeRegex(item.sentenceB)}`
         // We pass this special pattern to our highlight function
         // We need to bypass escapeRegex inside highlightText, so let's handle it manually or improve highlightText
         // Improved approach: just call highlightText with the regex string directly if we flag it.
         
         // Hacky reuse of highlightText:
         // We'll manually construct the regex and pass it?
         // Let's just highlight sentenceA for now to keep it simple, or A.
         highlightText(item.sentenceA, "sentence") 
      })
      structureList.appendChild(card)
    })
  }

  if (!hasItems) {
    structureList.innerHTML = '<div class="empty">No structural issues found.</div>'
  }
}

// --- Main Analysis Logic ---

form.addEventListener("submit", async (e) => {
  e.preventDefault()
  setStatus("Analyzing...", "info")
  submitButton.disabled = true
  
  const formData = new FormData(form)
  
  // If text editor has content and no file selected, append text
  const editorText = editor.innerText
  const fileInput = document.getElementById("file")
  
  if (!fileInput.files.length && editorText.trim().length > 0) {
    formData.set("text", editorText)
  }

  // Handle checkboxes
  form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    formData.set(checkbox.name, checkbox.checked ? "true" : "false")
  })

  try {
    const res = await fetch("/api/analyze", { method: "POST", body: formData })
    const data = await res.json()
    
    if (!res.ok) throw new Error(data.error || "Analysis failed")
    
    currentAnalysis = data
    
    // Update Editor with normalized text from server (optional, but good for consistency)
    if (data.text) {
      editor.innerText = data.text
      updateStats(data.text)
    }

    // Render Data
    uniqueWordsCount.textContent = `${data.totals.uniqueWords} unique`
    renderFrequencyList(data.repeatedWords)
    renderStructureList(data)
    
    setStatus("Analysis complete.", "success")
    
    // Enable Exports
    exportJsonButton.disabled = false
    exportCsvButton.disabled = false
    
    // Switch to Words tab automatically to show results
    document.querySelector('[data-tab="words"]').click()

  } catch (err) {
    console.error(err)
    setStatus(err.message, "error")
  } finally {
    submitButton.disabled = false
  }
})

loadSampleButton.addEventListener("click", () => {
  // Use fetch to get the file, or just hardcode for simplicity. 
  // Since we created sample_text.txt in root, we can try fetching it if we expose it via express static.
  // Server.js exposes "public", but sample_text.txt is in root.
  // We should move sample_text.txt to public or just hardcode it here.
  // Let's hardcode it to ensure it works without server config changes.
  
  const sampleText = `The importance of writing clear text cannot be overstated. The importance of writing clear text is huge. Writing clear text is very important for communication.

Basically, we want to avoid repetition. Basically, repetition is bad. In other words, we should vary our vocabulary. In other words, use different words.

This is an example of a very long sentence that wanders around the point without ever really getting to it, adding clause after clause of unnecessary detail and filler words that serve no purpose other than to inflate the word count and confuse the reader, which is exactly what we are trying to avoid in good writing.

However, sometimes we make mistakes. However, we can correct them. Therefore, we use tools. Therefore, we use analyzers.

The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the active dog.`

  editor.innerText = sampleText
  updateStats(sampleText)
  setStatus("Sample text loaded. Click 'Analyze Text' to see results.", "success")
})

// --- Editor Interaction ---

editor.addEventListener("input", () => {
  // If user types, we should clear highlights to avoid messing up HTML
  if (isHighlighting) {
    // This is tricky: contenteditable with <mark> tags behaves weirdly.
    // Ideally we strip tags.
    // For now, let's just update stats.
  }
  updateStats(editor.innerText)
})

editor.addEventListener("click", () => {
    // If user clicks inside to edit, maybe clear highlights?
    // Let's leave them for now unless they type.
})

// --- Exports ---
// (Reuse existing export logic or simplify)
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

exportJsonButton.addEventListener("click", () => {
  if (!currentAnalysis) return
  downloadFile("analysis.json", JSON.stringify(currentAnalysis, null, 2), "application/json")
})

exportCsvButton.addEventListener("click", () => {
  // Simple CSV export for repeated words only for now
  if (!currentAnalysis) return
  const lines = ["Type,Value,Count"]
  currentAnalysis.repeatedWords.forEach(w => lines.push(`Word,"${w.value}",${w.count}`))
  downloadFile("analysis.csv", lines.join("\n"), "text/csv")
})

// Init
updateStats(editor.innerText)