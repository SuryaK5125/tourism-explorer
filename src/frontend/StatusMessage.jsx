import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined'

// Loading skeleton, empty results, invalid location and API failure states

export function LoadingState({ placeName }) {
  return (
    <div className="te-status" aria-busy="true">
      <p className="te-status__line">Finding places worth seeing around {placeName}…</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="te-skeleton" style={{ '--i': i }}>
          <span className="te-skeleton__thumb" />
          <span className="te-skeleton__lines">
            <span />
            <span />
          </span>
        </div>
      ))}
    </div>
  )
}

export function MessageState({ title, children, action }) {
  return (
    <div className="te-status te-status--message" role="status">
      <ExploreOutlinedIcon className="te-status__icon" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  )
}
