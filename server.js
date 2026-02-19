const express = require("express")
const path = require("path")
const multer = require("multer")
const mammoth = require("mammoth")

const app = express()
const port = process.env.PORT || 3000

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
})

app.use(express.json({ limit: "1mb" }))
app.use(express.static(path.join(__dirname, "public")))

const stopwords = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","aren","as","at",
  "be","because","been","before","being","below","between","both","but","by",
  "can","could",
  "did","do","does","doing","down","during",
  "each","few","for","from","further",
  "had","has","have","having","he","her","here","hers","herself","him","himself","his","how",
  "i","if","in","into","is","it","its","itself",
  "just",
  "me","more","most","my","myself",
  "no","nor","not","now",
  "of","off","on","once","only","or","other","our","ours","ourselves","out","over","own",
  "s","same","she","should","so","some","such",
  "t","than","that","the","their","theirs","them","themselves","then","there","these","they","this","those","through","to","too",
  "under","until","up",
  "very",
  "was","we","were","what","when","where","which","while","who","whom","why","will","with",
  "you","your","yours","yourself","yourselves"
])

const wordRegex = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:'[A-Za-zÀ-ÖØ-öø-ÿ]+)?/g

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n").trim()
}

function tokenizeWords(text) {
  const matches = text.match(wordRegex) || []
  return matches.map((w) => w.toLowerCase())
}

function splitSentences(text) {
  const sentences = []
  let buffer = ""
  for (const char of text) {
    buffer += char
    if (/[.!?]/.test(char)) {
      const trimmed = buffer.trim()
      if (trimmed) sentences.push(trimmed)
      buffer = ""
    }
  }
  const rest = buffer.trim()
  if (rest) sentences.push(rest)
  return sentences
}

function buildFrequency(words, excludeCommon) {
  const freq = new Map()
  for (const word of words) {
    if (excludeCommon && stopwords.has(word)) continue
    freq.set(word, (freq.get(word) || 0) + 1)
  }
  return freq
}

function topEntries(freq, minCount = 2, limit = 20) {
  return [...freq.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ value: word, count }))
}

function ngramFrequency(words, n) {
  const freq = new Map()
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(" ")
    freq.set(gram, (freq.get(gram) || 0) + 1)
  }
  return freq
}

function sentenceWordSet(sentence) {
  const words = tokenizeWords(sentence)
  const filtered = words.filter((w) => !stopwords.has(w))
  return new Set(filtered)
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function analyzeText(text, options) {
  const normalized = normalizeText(text)
  const words = tokenizeWords(normalized)
  const totalWords = words.length
  const uniqueWords = new Set(words).size
  const lexicalDiversity = totalWords ? uniqueWords / totalWords : 0

  const excludeCommon = options.excludeCommon
  const wordFreqAll = buildFrequency(words, false)
  const wordFreq = buildFrequency(words, excludeCommon)
  const repeatedWords = options.repeatedWords ? topEntries(wordFreq, 2, options.maxResults) : []

  const phraseResults = []
  if (options.repeatedPhrases) {
    const grams = [3, 4]
    const phraseWords = excludeCommon ? words.filter((word) => !stopwords.has(word)) : words
    for (const n of grams) {
      const freq = ngramFrequency(phraseWords, n)
      const top = topEntries(freq, 2, 10).map((entry) => ({
        ...entry,
        n
      }))
      phraseResults.push(...top)
    }
  }

  let similarSentences = []
  let repeatedStarters = []
  let longSentences = []
  const sentences = splitSentences(normalized)

  if (sentences.length) {
    const sentenceWordCounts = sentences.map((s) => tokenizeWords(s).length)
    const avg = sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length
    const variance = sentenceWordCounts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / sentenceWordCounts.length
    const std = Math.sqrt(variance)
    longSentences = sentences
      .map((sentence, idx) => ({ sentence, words: sentenceWordCounts[idx] }))
      .filter((s) => s.words >= avg + std && s.words >= 20)
      .slice(0, 10)
  }

  if (options.similarSentences && sentences.length) {
    const capped = sentences.slice(0, 200)
    const sets = capped.map(sentenceWordSet)
    const results = []
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const score = jaccard(sets[i], sets[j])
        if (score >= 0.75 && capped[i].length > 40 && capped[j].length > 40) {
          results.push({ sentenceA: capped[i], sentenceB: capped[j], score: Number(score.toFixed(2)) })
        }
      }
    }
    similarSentences = results.sort((a, b) => b.score - a.score).slice(0, 10)
  }

  if (options.repeatedStarters && sentences.length) {
    const starters = new Map()
    for (const sentence of sentences) {
      const wordsInSentence = tokenizeWords(sentence)
      const starter = wordsInSentence.slice(0, 3).join(" ")
      if (!starter) continue
      starters.set(starter, (starters.get(starter) || 0) + 1)
    }
    repeatedStarters = topEntries(starters, 2, 10)
  }

  const customCounts = []
  if (options.customWords.length) {
    for (const term of options.customWords) {
      const count = wordFreqAll.get(term) || 0
      customCounts.push({ value: term, count })
    }
  }

  return {
    text: normalized,
    totals: {
      totalWords,
      uniqueWords,
      lexicalDiversity: Number(lexicalDiversity.toFixed(3)),
      totalSentences: sentences.length
    },
    repeatedWords,
    repeatedPhrases: phraseResults,
    similarSentences,
    repeatedStarters,
    longSentences,
    customCounts
  }
}

async function extractTextFromFile(file) {
  const ext = path.extname(file.originalname || "").toLowerCase()
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer })
    return result.value || ""
  }
  if (ext === ".txt" || ext === ".md") {
    return file.buffer.toString("utf8")
  }
  return ""
}

app.post("/api/analyze", upload.single("file"), async (req, res) => {
  try {
    const resolveBoolean = (value, defaultValue) => {
      if (value === "true") return true
      if (value === "false") return false
      return defaultValue
    }
    const options = {
      repeatedWords: resolveBoolean(req.body.repeatedWords, true),
      repeatedPhrases: resolveBoolean(req.body.repeatedPhrases, true),
      similarSentences: resolveBoolean(req.body.similarSentences, true),
      repeatedStarters: resolveBoolean(req.body.repeatedStarters, true),
      excludeCommon: resolveBoolean(req.body.excludeCommon, true),
      maxResults: Number(req.body.maxResults || 20),
      customWords: (req.body.customWords || "")
        .split(",")
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
    }

    let text = ""
    if (req.file) {
      text = await extractTextFromFile(req.file)
      if (!text) {
        return res.status(400).json({ error: "Unsupported file type. Upload .txt, .md, or .docx." })
      }
    } else if (req.body.text) {
      text = req.body.text
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No text provided." })
    }

    const data = analyzeText(text, options)
    return res.json(data)
  } catch (error) {
    return res.status(500).json({ error: "Failed to analyze text." })
  }
})

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Max size is 2MB." })
  }
  return next(error)
})

app.get("/health", (req, res) => {
  res.json({ ok: true })
})

app.listen(port, () => {
  console.log(`Server running on ${port}`)
})
