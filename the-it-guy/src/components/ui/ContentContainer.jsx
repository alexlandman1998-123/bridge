function ContentContainer({ className = '', children }) {
  return <div className={`w-full max-w-none px-6 py-0 md:px-8 xl:px-10 ${className}`.trim()}>{children}</div>
}

export default ContentContainer
