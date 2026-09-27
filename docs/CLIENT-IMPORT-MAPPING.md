# TurfOS client import + automatic property setup

## Bulk client import
Open **Customers & Properties** and choose **Import clients**. Upload a CSV with at least **Customer Name** and **Service Address**. TurfOS also recognizes Email, Phone, Turf SqFt, Price, and Notes. Existing customers are matched by email or service address to reduce duplicates.

Imported records are saved into the business workspace and sync through the existing Cloudflare `TURFOS_ACCOUNTS` binding.

## Automatic property mapping
Use **Auto-map unmapped** to process up to 25 unmapped properties at a time. TurfOS attempts to geocode the service address, load the parcel, detect building/driveway shapes, subtract those shapes from the automatic mow area, and calculate an initial mowing direction from the property geometry.

For one property, open **Property Map** and choose **Auto-map property**. Manual parcel correction, structure review, and lawn tracing are under **Advanced map corrections**.
