# Hikes Visualization

This project visualizes hiking data from a Google Sheet on a Google Map, including GPX trace rendering.

## Running Locally with Docker Compose (Recommended)

To avoid CORS issues when loading local GPX or JSON files, it's best to run this via a local web server. Docker Compose simplifies this process and enables live reloading.

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed (includes Docker Compose).

### Instructions

1.  **Start the service**:
    ```bash
    docker compose up
    ```

    The current directory is mounted into the container, so any changes you make to `index.html`, `script.js`, or `style.css` will be reflected immediately upon refreshing the page.

2.  **Open in Browser**:
    Visit [http://localhost:8080](http://localhost:8080) to view the map.

## File Structure
- `index.html`: The main page.
- `script.js`: Contains all the logic for fetching data, parsing GPX, and rendering the map.
- `style.css`: Styles for the map and info windows.
- `gpx/`: Directory containing your GPX trace files (named `yyyymmdd.gpx`).
- `Dockerfile`: Defines the nginx server setup.
- `docker-compose.yaml`: Defines the services, networks, and volumes for the Docker application.
