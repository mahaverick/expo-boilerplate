# Update certificates

This directory holds one public certificate per release variant, at `certs/<variant>/certificate.pem`, which the app uses to verify the signature of each over-the-air update. No private key is committed here; the private key stays with the team that publishes updates. To create a certificate and turn updates on, follow the setup section of the README.
