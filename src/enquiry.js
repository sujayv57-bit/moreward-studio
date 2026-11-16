export function prepareEnquiry(event) {
  event.preventDefault()
  const form = event.currentTarget
  if (!form.reportValidity()) return
  const values = new FormData(form)
  const message = [
    'Hello Moreward Studio,',
    '',
    'I would like to start a project conversation.',
    '',
    `Name: ${values.get('name')}`,
    `Work email: ${values.get('email')}`,
    `What I am looking to build: ${values.get('message')}`,
  ].join('\n')
  window.location.href = `mailto:sujay@nidhivriddhi.com?subject=${encodeURIComponent('Moreward Studio project enquiry')}&body=${encodeURIComponent(message)}`
}
