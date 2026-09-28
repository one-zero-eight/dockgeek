/*
 * If changed, have to run `npm run build-docker-builder-go`.
 * This script should be run after a period of time (180s), because the server may need some time to prepare.
 */
package main

import (
	"crypto/tls"
	"crypto/x509"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	// Kubernetes may inject a service URL into DOCKGEEK_PORT.
	isK8s := strings.HasPrefix(os.Getenv("DOCKGEEK_PORT"), "tcp://")

	transport := http.DefaultTransport.(*http.Transport).Clone()
	if caFile := os.Getenv("DOCKGEEK_SSL_CA"); caFile != "" {
		roots, err := x509.SystemCertPool()
		if err != nil {
			log.Fatalln(err)
		}
		certificate, err := os.ReadFile(caFile)
		if err != nil {
			log.Fatalln(err)
		}
		if !roots.AppendCertsFromPEM(certificate) {
			log.Fatalf("no certificates found in %s", caFile)
		}
		transport.TLSClientConfig = &tls.Config{RootCAs: roots}
	}

	client := http.Client{
		Transport: transport,
		Timeout:   28 * time.Second,
	}

	sslKey := os.Getenv("DOCKGEEK_SSL_KEY")
	sslCert := os.Getenv("DOCKGEEK_SSL_CERT")

	hostname := os.Getenv("DOCKGEEK_HOSTNAME")
	if len(hostname) == 0 {
		hostname = "127.0.0.1"
	}

	port := ""
	// DOCKGEEK_PORT is override by K8S unexpectedly,
	if !isK8s {
		port = os.Getenv("DOCKGEEK_PORT")
	}
	if len(port) == 0 {
		port = "5001"
	}

	protocol := ""
	if len(sslKey) != 0 && len(sslCert) != 0 {
		protocol = "https"
	} else {
		protocol = "http"
	}

	url := protocol + "://" + hostname + ":" + port + "/api/dockgeek/session"

	log.Println("Checking " + url)
	resp, err := client.Get(url)

	if err != nil {
		log.Fatalln(err)
	}

	defer resp.Body.Close()

	_, err = io.Copy(io.Discard, resp.Body)

	if err != nil {
		log.Fatalln(err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusBadRequest {
		log.Fatalf("Health Check Failed [Res Code: %d]", resp.StatusCode)
	}

	log.Printf("Health Check OK [Res Code: %d]\n", resp.StatusCode)

}
