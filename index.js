const express = require("express");
const { Builder, By, until, Key } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const bodyParser = require("body-parser");
const CORS = require("cors");

const app = express();
const port = 3000;
app.use(CORS("*"));
app.use(bodyParser.json());

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

app.post("/scrape", async (req, res) => {
  const { industry, country, pages, start = 0, limit = 20 } = req.body;

  if (!industry || !country || !pages) {
    return res.status(400).send({ error: "Missing parameters" });
  }

  let chromeOptions = new chrome.Options();
  chromeOptions.addArguments("--headless");
  chromeOptions.addArguments("--disable-blink-features=AutomationControlled");

  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(chromeOptions)
    .build();

  try {
    let profiles = [];
    let currentPage = 1;
    const maxPages = parseInt(pages, 10);
    let processedUrls = new Set();

    await driver.get(
      `https://www.google.com/search?q=site:linkedin.com/in+${encodeURIComponent(
        industry
      )}+${encodeURIComponent(country)}&num=20`
    );

    while (currentPage <= maxPages && profiles.length < start + limit) {
      await driver.wait(until.elementLocated(By.css("div#search")), 10000);

      const profileElements = await driver.findElements(By.css("div.g"));

      for (let element of profileElements) {
        if (profiles.length >= start + limit) break;

        const linkElement = await element.findElement(By.css("a"));
        const profileLink = await linkElement.getAttribute("href");

        if (processedUrls.has(profileLink)) continue;
        processedUrls.add(profileLink);

        const profileNameElement = await element.findElement(By.css("h3"));
        const profileName = await profileNameElement.getText();

        let profileAddress = "No address found";
        try {
          const descriptionElement = await element.findElement(
            By.css("div.VwiC3b")
          );
          profileAddress = await descriptionElement.getText();
        } catch (e) {}

        if (profileLink.includes("linkedin.com/in/")) {
          profiles.push({
            name: profileName,
            link: profileLink,
            address: profileAddress,
          });
        }
      }

      if (profiles.length >= start + limit || currentPage >= maxPages) break;

      try {
        const nextButton = await driver.findElement(By.id("pnnext"));
        await nextButton.click();
        currentPage++;
        await driver.wait(until.elementLocated(By.css("div#search")), 10000);
      } catch (e) {
        break;
      }
    }

    const paginatedProfiles = profiles.slice(start, start + limit);
    res.status(200).json({
      profiles: paginatedProfiles,
      totalProfiles: profiles.length,
      hasMore: profiles.length > start + limit,
    });
  } catch (error) {
    console.error("Error during scraping:", error);
    res.status(500).send({ error: "An error occurred during scraping" });
  } finally {
    await driver.quit();
  }
});
