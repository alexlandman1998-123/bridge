function ContentContainer({ className = '', children }) {
  return <div className={`ui-content-container ${className}`.trim()}>{children}</div>
}

export default ContentContainer
