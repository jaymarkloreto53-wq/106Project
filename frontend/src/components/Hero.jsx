// Big banner at the top of a page: photo background, eyebrow, headline, short text, buttons.
export default function Hero({ eyebrow, title, text, image, actions }) {
  const style = image
    ? {
        backgroundImage: `linear-gradient(100deg, rgb(20 33 61 / 0.9) 0%, rgb(20 33 61 / 0.6) 60%, rgb(20 33 61 / 0.25) 100%), url("${image.replace(/"/g, "%22")}")`,
      }
    : undefined;

  return (
    <section className="banner" style={style} aria-labelledby="banner-title">
      {eyebrow && <p className="banner-eyebrow">{eyebrow}</p>}
      <h1 id="banner-title">{title}</h1>
      {text && <p className="banner-text">{text}</p>}
      {actions && <div className="row banner-actions">{actions}</div>}
    </section>
  );
}
