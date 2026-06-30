/** Shared email/password validation — English + common symbols only. */
const ENGLISH_ONLY_ERROR = 'กรุณากรอกเป็นภาษาอังกฤษเท่านั้น'

function isEnglishOnly(value) {
  return /^[a-zA-Z0-9@._\-!#$%^&*]+$/.test(value)
}

function englishOnlyFieldError(value) {
  if (!value) return ''
  return isEnglishOnly(value) ? '' : ENGLISH_ONLY_ERROR
}

function bindEnglishInput(inputId, errorId) {
  const input = document.getElementById(inputId)
  const errEl = document.getElementById(errorId)
  if (!input || !errEl) return

  const validate = () => {
    const msg = englishOnlyFieldError(input.value)
    errEl.textContent = msg
    errEl.style.display = msg ? 'block' : 'none'
    return !msg
  }

  input.addEventListener('input', validate)
  input.addEventListener('blur', validate)
  return validate
}

function formHasEnglishErrors(form) {
  return Array.from(form.querySelectorAll('[data-english-only]')).some((el) => {
    const msg = englishOnlyFieldError(el.value)
    return !!msg
  })
}
