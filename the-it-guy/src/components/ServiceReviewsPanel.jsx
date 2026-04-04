function ServiceReviewsPanel({ reviews, embedded = false, showHeader = true }) {
  const Wrapper = embedded ? 'div' : 'section'

  return (
    <Wrapper className={embedded ? 'request-panel-embedded' : 'panel-section'}>
      {showHeader ? (
        <div className="section-header">
          <div className="section-header-copy">
            <h3>Service Reviews</h3>
            <p>Client feedback captured from the controlled post-completion portal review flow.</p>
          </div>
        </div>
      ) : null}

      <ul className="request-list">
        {reviews.map((review) => (
          <li key={review.id} className="review-row">
            <div className="review-rating">{'★'.repeat(review.rating)}{'☆'.repeat(Math.max(0, 5 - review.rating))}</div>
            <p>{review.review_text || 'No written review text provided.'}</p>
            <span>
              Positives: {review.positives || '-'}
              <br />
              Improvements: {review.improvements || '-'}
            </span>
            <small>
              {new Date(review.created_at).toLocaleString()} • {review.allow_marketing_use ? 'Approved for testimonial use' : 'Internal only'}
            </small>
          </li>
        ))}

        {!reviews.length ? <li className="empty-text">No service reviews submitted yet.</li> : null}
      </ul>
    </Wrapper>
  )
}

export default ServiceReviewsPanel
