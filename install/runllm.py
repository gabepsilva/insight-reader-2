#!/usr/bin/env python3
"""
Grammar and Spelling Checker using Instruction-Tuned LLM

Uses an instruction-tuned LLaMA model (compatible with llama.cpp) with
specialized prompts for grammar and spelling correction.

Best models for grammar checking on Hugging Face:
- Llama-3.1-8B-Instruct (excellent, but larger ~5GB)
- Llama-3.2-3B-Instruct (good balance, ~2GB)
- Phi-3-mini-4k-instruct (small, fast, ~2GB)
- Mistral-7B-Instruct (very good, ~4GB)

Note: T5/FLAN-T5 models are NOT compatible with llama.cpp as they use
encoder-decoder architecture. Use LLaMA-based models instead.

Usage:
    python3 runllm.py [text to check]
    
    Example:
    python3 runllm.py "The sky are blue"

Requirements:
    - huggingface_hub
    - llama-cpp-python
    Install with: pip install huggingface_hub llama-cpp-python
"""

from huggingface_hub import hf_hub_download, list_repo_files
from llama_cpp import Llama
import sys

# Get text from command line argument or use default
if len(sys.argv) > 1:
    text_to_check = " ".join(sys.argv[1:])
else:
    text_to_check = """There are some cases where the the standard grammar checkers don't cut it. That;s where Harper comes in handy.
Harper is an language checker for developers. It can detect improper capitalization and misspellled words, as well as a number of other issues. Like if you break up words you shoul dn't. Harper can be an lifesaver when writing technical documents, emails or other formal forms of communication.
Harper works everywhere, even when you're not online. Since your data never leaves your device, you don't ned too worry aout us selling it or using it to train large language models.
The best part: Harper can give you feedback instantly. For most documents, Harper can serve up suggestions in under 10 ms, faster that Grammarly."""

# Use instruction-tuned LLaMA models (compatible with llama.cpp)
# These models work well for grammar checking with proper prompts
# Try smaller models first for faster download and inference
repos_to_try = [
    # Smaller, faster models (good for grammar checking)
    ("bartowski/Llama-3.2-3B-Instruct-GGUF", "Llama-3.2-3B-Instruct-Q4_K_M.gguf"),  # ~2GB, excellent
    ("bartowski/Phi-3-mini-4k-instruct-GGUF", "Phi-3-mini-4k-instruct-Q4_K_M.gguf"),  # ~2GB, very good
    ("bartowski/Meta-Llama-3.1-8B-Instruct-GGUF", "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"),  # ~5GB, best quality
    # Fallback options
    ("bartowski/Llama-3.2-3B-Instruct-GGUF", "Llama-3.2-3B-Instruct-Q5_K_M.gguf"),
    ("bartowski/Phi-3-mini-4k-instruct-GGUF", "Phi-3-mini-4k-instruct-Q5_K_M.gguf"),
]

model_path = None
for repo_id, filename in repos_to_try:
    try:
        print(f"Trying {repo_id.split('/')[-1]}/{filename}...")
        model_path = hf_hub_download(repo_id=repo_id, filename=filename)
        print(f"✓ Successfully downloaded {filename}")
        break
    except Exception as e:
        error_msg = str(e)
        if "404" in error_msg:
            print(f"✗ File not found, trying next...")
        else:
            print(f"✗ Failed: {error_msg[:80]}...")
        continue

if model_path is None:
    print("\nError: Could not download a compatible model.")
    print("\nRecommended models for grammar checking:")
    print("  - Llama-3.2-3B-Instruct (best balance of size/quality)")
    print("  - Phi-3-mini-4k-instruct (small and fast)")
    print("  - Llama-3.1-8B-Instruct (best quality, larger)")
    print("\nBrowse GGUF models at: https://huggingface.co/models?library=gguf&sort=downloads")
    sys.exit(1)

llm = Llama(
    model_path=model_path,
    n_ctx=4096,  # Context window for instruction models
    n_threads=8,   # set to ~ your CPU cores (adjust based on your system)
    verbose=False,
)

# Use instruction-tuned prompt format for educational grammar checking
print(f"\nAnalyzing text for grammar and spelling errors...\n")
print("="*60)
print("ORIGINAL TEXT:")
print("="*60)
print(text_to_check)
print("="*60)
print("\n")

# Educational prompt that explains each error for learning
prompt = f"""Analyze the following text and identify all grammar, spelling, and punctuation errors. For each error, provide:
1. Error number
2. Error type (Spelling, Grammar, Punctuation, Word choice, Missing word, Extra word, etc.)
3. The incorrect text (quote the exact phrase)
4. Brief explanation of why it's wrong
5. The correct version

Format your response as a numbered list. Be thorough and find all errors.

Text to analyze:
"{text_to_check}"

Errors found:

"""

# For instruction models, use low temperature for accurate corrections
out = llm(
    prompt,
    max_tokens=2000,  # Allow for detailed explanations
    temperature=0.1,  # Low temperature for accurate, consistent analysis
    top_p=0.9,  # Nucleus sampling
    repeat_penalty=1.1,  # Slight penalty to avoid repetition (0 was too low)
    stop=["\n\n\n", "Text to analyze:", "Original text:"],  # Stop at natural boundaries
)

analysis = out["choices"][0]["text"].strip()

print("="*60)
print("ERROR ANALYSIS (for learning):")
print("="*60)
print(analysis)
print("="*60)

# Also provide a corrected version for reference
print("\n" + "="*60)
print("CORRECTED VERSION (for reference):")
print("="*60)

correction_prompt = f"""Fix all grammar and spelling errors in the following text. Output only the corrected version without any explanation.

Text to correct: "{text_to_check}"

Corrected text:"""

out_corrected = llm(
    correction_prompt,
    max_tokens=500,
    temperature=0.1,
    top_p=0.9,
    repeat_penalty=1.1,
    stop=["\n\n", "Text to correct:"],
)

corrected_text = out_corrected["choices"][0]["text"].strip()
print(corrected_text)
print("="*60)

